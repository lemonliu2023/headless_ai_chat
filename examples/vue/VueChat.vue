<!--
  Vue 示例 —— 直接消费 headless core。
  关键点:Vue 只需要在 core.subscribe 时更新 shallowRef。
-->
<script setup lang="ts">
import { onScopeDispose, ref, shallowRef, type Ref } from 'vue';
import { ChatCore } from '../../core/chat.ts';
import { MockTransport } from '../../core/transport.ts';
import type { ChatState } from '../../core/types.ts';

const core = new ChatCore(new MockTransport());

function useChat<T>(
  selector: (s: ChatState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): Ref<T> {
  const r = shallowRef(selector(core.getState()));
  const unsub = core.subscribe(() => {
    const next = selector(core.getState());
    if (!isEqual(r.value, next)) r.value = next;
  });
  onScopeDispose(unsub);
  return r;
}

const shallowArr = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const messageIds = useChat((s) => s.messageIds, shallowArr);
const messages = useChat((s) => s.messages);
const blocks = useChat((s) => s.blocks);
const streaming = useChat((s) => s.streaming);

const text = ref('');

function send() {
  if (!text.value.trim()) return;
  core.send(text.value);
  text.value = '';
}
</script>

<template>
  <div>
    <div v-for="mid in messageIds" :key="mid" :data-role="messages[mid].role">
      <template v-for="bid in messages[mid].blockIds" :key="bid">
        <div v-if="blocks[bid].type === 'tool'" class="tool">
          tool {{ blocks[bid].name }}({{ blocks[bid].argsText }}) [{{ blocks[bid].status }}]
        </div>
        <div v-else class="text">{{ blocks[bid].text }}</div>
      </template>
    </div>
    <div>
      <input v-model="text" />
      <button :disabled="streaming" @click="send">发送</button>
      <button v-if="streaming" @click="core.abort()">停止</button>
    </div>
  </div>
</template>
