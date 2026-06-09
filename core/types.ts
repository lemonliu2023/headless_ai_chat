// ===========================================================================
// Core 层 —— 纯 TS,零框架零平台。三端共用。
// 这里定义:领域类型 + 适配器"端口"(接口)。实现由各平台注入。
// ===========================================================================

/** 一条消息里的内容块:文本块 或 工具调用块 */
export type Block =
  | { id: string; type: 'text'; text: string; status: 'streaming' | 'done' }
  | {
      id: string;
      type: 'tool';
      name: string;
      argsText: string;       // 流式拼接的原始 JSON 字符串(中途可能是非法 JSON)
      args?: unknown;         // 到 stop 时才 parse 出来的结果
      status: 'streaming' | 'done';
    };

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  blockIds: string[];         // 结构:这条消息有哪些块、什么顺序
}

/** 全局状态:消息扁平存、块也扁平存(O(1) 取 + 细粒度订阅) */
export interface ChatState {
  messageIds: string[];
  messages: Record<string, Message>;
  blocks: Record<string, Block>;
  streaming: boolean;
}

// --- 规范化的流式事件(core 只认这个,与具体大模型协议解耦) ---
export type StreamEvent =
  | { t: 'start'; i: number; block: { type: 'text' } | { type: 'tool'; name: string } }
  | { t: 'text'; i: number; d: string }
  | { t: 'args'; i: number; d: string }
  | { t: 'stop'; i: number }
  | { t: 'done' };

// =============================== 端口(接口) ===============================
// Core 只依赖这些抽象;fetch / wx.request / sqlite 等具体实现各端注入。

export interface TransportInput {
  text: string;
}

export interface TransportHandlers {
  onChunk: (textChunk: string) => void;  // 平台把网络流转成文本块喂进来
  onDone: () => void;
  onError: (err: unknown) => void;
}

export interface AbortHandle {
  abort: () => void;
}

/** 传输端口:不同平台用不同方式拿流(fetch / wx.request enableChunked) */
export interface Transport {
  send(input: TransportInput, handlers: TransportHandlers): AbortHandle;
}

/** 持久化端口:不同平台不同实现(IndexedDB / wx.storage / sqlite) */
export interface Storage {
  load(key: string): Promise<string | null>;
  save(key: string, value: string): Promise<void>;
}
