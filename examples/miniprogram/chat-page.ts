// ===========================================================================
// 小程序示例 —— 直接消费 headless core。
// 关键点:小程序没有响应式,订阅 core 后把需要渲染的状态批量 setData。
// ===========================================================================

import { ChatCore } from '../../core/chat.ts';
import { MockTransport } from '../../core/transport.ts';
import type { ChatState } from '../../core/types.ts';

interface PageLike {
  setData(data: Record<string, unknown>): void;
}

const core = new ChatCore(new MockTransport());

function mapState(s: ChatState) {
  return {
    messageIds: s.messageIds,
    messages: s.messages,
    blocks: s.blocks,
    streaming: s.streaming,
  };
}

export function bindChatPage(page: PageLike) {
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    page.setData(mapState(core.getState()));
  };

  const onChange = () => {
    if (scheduled) return;
    scheduled = true;
    Promise.resolve().then(flush);
  };

  page.setData(mapState(core.getState()));
  return core.subscribe(onChange);
}

export function sendMessage(text: string) {
  if (!text.trim()) return;
  core.send(text);
}

export function abortMessage() {
  core.abort();
}
