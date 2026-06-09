// ===========================================================================
// Core 层 —— ChatCore:门面(Facade)。
// 对外只暴露 send / abort / subscribe / getState,内部把
// store(状态)+ sse(解析)+ transport(平台传输)编排在一起。
// 这一整层 100% 纯 TS,可在 Node、任意框架、任意平台运行。
// ===========================================================================

import { createStore, type Store } from './store.ts';
import { createSSEParser } from './sse.ts';
import {
  initialState, addMessage, startBlock, appendText, appendArgs, stopBlock, setStreaming,
} from './state.ts';
import type { ChatState, Transport, StreamEvent, Block } from './types.ts';

let seq = 0;
const uid = (p: string) => `${p}_${Date.now().toString(36)}_${seq++}`;

export class ChatCore {
  private store: Store<ChatState> = createStore(initialState);
  private currentAbort?: () => void;

  constructor(private transport: Transport) {}

  // ---- 对外 API ----
  subscribe = (l: () => void) => this.store.subscribe(l);
  getState = () => this.store.getState();

  send(userText: string) {
    // 1) 落一条用户消息(一个 text 块)+ 一条空的 assistant 消息
    const userMsgId = uid('msg');
    const userBlockId = uid('blk');
    const asstMsgId = uid('msg');

    this.store.setState((s) => {
      s = addMessage(s, { id: userMsgId, role: 'user', blockIds: [] });
      s = startBlock(s, userMsgId, { id: userBlockId, type: 'text', text: userText, status: 'done' });
      s = addMessage(s, { id: asstMsgId, role: 'assistant', blockIds: [] });
      return setStreaming(s, true);
    });

    // 2) 事件 index → blockId 映射(本次回答内)
    const indexToBlockId = new Map<number, string>();
    const parser = createSSEParser((ev) => this.apply(asstMsgId, indexToBlockId, ev));

    // 3) 通过平台 Transport 发起流式请求,把文本块喂给 SSE 解析器
    const handle = this.transport.send(
      { text: userText },
      {
        onChunk: (chunk) => parser.feed(chunk),
        onDone: () => this.store.setState((s) => setStreaming(s, false)),
        onError: () => this.store.setState((s) => setStreaming(s, false)),
      },
    );
    this.currentAbort = handle.abort;
  }

  abort() {
    this.currentAbort?.();
    this.store.setState((s) => setStreaming(s, false));
  }

  // ---- 把规范化事件应用到 store(状态机迁移) ----
  private apply(msgId: string, map: Map<number, string>, ev: StreamEvent) {
    switch (ev.t) {
      case 'start': {
        const id = uid('blk');
        map.set(ev.i, id);
        const block: Block =
          ev.block.type === 'text'
            ? { id, type: 'text', text: '', status: 'streaming' }
            : { id, type: 'tool', name: ev.block.name, argsText: '', status: 'streaming' };
        this.store.setState((s) => startBlock(s, msgId, block));
        break;
      }
      case 'text':
        this.store.setState((s) => appendText(s, map.get(ev.i)!, ev.d));
        break;
      case 'args':
        this.store.setState((s) => appendArgs(s, map.get(ev.i)!, ev.d));
        break;
      case 'stop':
        this.store.setState((s) => stopBlock(s, map.get(ev.i)!));
        break;
      case 'done':
        this.store.setState((s) => setStreaming(s, false));
        break;
    }
  }
}
