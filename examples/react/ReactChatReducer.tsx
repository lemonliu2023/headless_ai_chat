// ===========================================================================
// ReactChatReducer 示例 —— 用 useReducer 替代 useSyncExternalStore。
//
// 对比原版 ReactChat.tsx:
//   原版: useSyncExternalStore → React 每次渲染时去外部 store 读数据
//         外部 store 在渲染中途变化 → 撕裂 → 被迫降级为同步渲染
//
//   本版: useReducer → 状态住在 React 内部
//         外部 core 只负责触发 dispatch，React 自己管快照
//         同一次渲染里所有组件读同一份 state → 天然无撕裂
// ===========================================================================

import React, {
  useReducer, useEffect, useContext,
  useState, useCallback, createContext,
} from 'react';
import { ChatCore } from '../../core/chat.ts';
import { MockTransport } from '../../core/transport.ts';
import type { ChatState } from '../../core/types.ts';

const core = new ChatCore(new MockTransport());

// ── 1. Reducer ──────────────────────────────────────────────────────────────
// 逻辑极简：core 变化时整体替换快照。
// 业务状态转移的复杂度留在 core 层，React 这里只做"接收新快照"。
type Action = { type: 'SYNC'; snapshot: ChatState };

function reducer(_prev: ChatState, action: Action): ChatState {
  return action.snapshot;
}

// ── 2. Context ──────────────────────────────────────────────────────────────
// 用 Context 把 state 分发给子组件，避免 prop drilling。
// 注意：Context 变化会触发所有消费者重渲；精细优化见 ReactChatSelectorMemo.tsx
const ChatStateContext = createContext<ChatState>(core.getState());

// ── 3. 自定义 Hook ───────────────────────────────────────────────────────────
function useChatReducer(): ChatState {
  const [state, dispatch] = useReducer(reducer, undefined, core.getState);

  useEffect(() => {
    const unsubscribe = core.subscribe(() => {
      dispatch({ type: 'SYNC', snapshot: core.getState() });
    });
    return unsubscribe;
  }, []);

  return state;
}

// ── 4. 根组件 ────────────────────────────────────────────────────────────────
export function ReactChatReducer() {
  const state = useChatReducer();
  const [text, setText] = useState('');

  const send = useCallback(() => {
    if (!text.trim()) return;
    core.send(text);
    setText('');
  }, [text]);

  return (
    <ChatStateContext.Provider value={state}>
      <div>
        {state.messageIds.map((id) => (
          <MessageView key={id} id={id} />
        ))}
        <div>
          <input value={text} onChange={(e) => setText(e.target.value)} />
          <button onClick={send} disabled={state.streaming}>发送</button>
          {state.streaming && <button onClick={() => core.abort()}>停止</button>}
        </div>
      </div>
    </ChatStateContext.Provider>
  );
}

// ── 5. 子组件：从 Context 读取所需数据 ──────────────────────────────────────
const MessageView = React.memo(function MessageView({ id }: { id: string }) {
  const state = useContext(ChatStateContext);
  const msg = state.messages[id];
  return (
    <div data-role={msg.role}>
      {msg.blockIds.map((bid) => (
        <BlockView key={bid} id={bid} />
      ))}
    </div>
  );
});

const BlockView = React.memo(function BlockView({ id }: { id: string }) {
  const state = useContext(ChatStateContext);
  const block = state.blocks[id];
  if (block.type === 'tool') {
    return <div className="tool">tool {block.name}({block.argsText}) [{block.status}]</div>;
  }
  return <div className="text">{block.text}</div>;
});
