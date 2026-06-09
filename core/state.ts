// ===========================================================================
// Core 层 —— ChatState 的纯函数迁移。
// 关键:不可变更新 + 结构共享(只给变化的 message/block 换新引用),
// 这样 selector / memo 才能只让"变化的那一块"重渲染。
// ===========================================================================

import type { ChatState, Block, Message } from './types.ts';

export const initialState: ChatState = {
  messageIds: [],
  messages: {},
  blocks: {},
  streaming: false,
};

export function addMessage(s: ChatState, msg: Message): ChatState {
  return {
    ...s,
    messageIds: [...s.messageIds, msg.id],
    messages: { ...s.messages, [msg.id]: msg },
  };
}

export function startBlock(s: ChatState, msgId: string, block: Block): ChatState {
  const msg = s.messages[msgId];
  return {
    ...s,
    messages: { ...s.messages, [msgId]: { ...msg, blockIds: [...msg.blockIds, block.id] } },
    blocks: { ...s.blocks, [block.id]: block },
  };
}

export function appendText(s: ChatState, blockId: string, delta: string): ChatState {
  const b = s.blocks[blockId];
  if (b?.type !== 'text') return s;
  // 只换这一个 block;messageIds、其它 block 引用全不变 → 兄弟气泡不重渲染
  return { ...s, blocks: { ...s.blocks, [blockId]: { ...b, text: b.text + delta } } };
}

export function appendArgs(s: ChatState, blockId: string, delta: string): ChatState {
  const b = s.blocks[blockId];
  if (b?.type !== 'tool') return s;
  // 只拼字符串,不在中途 parse —— 不完整 JSON 容错
  return { ...s, blocks: { ...s.blocks, [blockId]: { ...b, argsText: b.argsText + delta } } };
}

export function stopBlock(s: ChatState, blockId: string): ChatState {
  const b = s.blocks[blockId];
  if (!b) return s;
  let next: Block;
  if (b.type === 'tool') {
    next = { ...b, status: 'done', args: safeParse(b.argsText) }; // 到这一刻才 parse
  } else {
    next = { ...b, status: 'done' };
  }
  return { ...s, blocks: { ...s.blocks, [blockId]: next } };
}

export function setStreaming(s: ChatState, streaming: boolean): ChatState {
  return { ...s, streaming };
}

export function safeParse(text: string): unknown {
  try { return JSON.parse(text); } catch { return undefined; }
}
