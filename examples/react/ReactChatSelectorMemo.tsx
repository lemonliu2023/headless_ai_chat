// ===========================================================================
// ReactChatSelectorMemo 示例 —— selector + memo 精细渲染优化。
//
// 在 ReactChatReducer.tsx（useReducer + Context）基础上的进阶版：
//   问题：Context 任何字段变化 → 所有 useContext 消费者全部重渲
//   解法：去掉 Context，改为每个组件独立订阅 + selector 声明"我关心什么"
//
// 优化原理（依赖 core/state.ts 的结构共享）：
//   appendText(blockA) → 只有 blocks['blockA'] 换新引用
//   → BlockView(blockB) selector 返回旧引用 → useReducer bail-out → 不重渲 ✓
// ===========================================================================

import React, {
  useReducer, useEffect, useRef,
  useState, useCallback,
} from 'react';
import { ChatCore } from '../../core/chat.ts';
import { MockTransport } from '../../core/transport.ts';
import type { ChatState } from '../../core/types.ts';

const core = new ChatCore(new MockTransport());

// ── useChatSelector ──────────────────────────────────────────────────────────
// 每个组件独立订阅，selector 决定"我关心哪块数据"。
// useReducer bail-out：selector 返回值 Object.is 不变 → React 跳过此次渲染。
function useChatSelector<T>(selector: (s: ChatState) => T): T {
  // ref 保证 effect 里始终用最新 selector，同时 effect 不需要重新注册订阅
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  const [value, dispatch] = useReducer(
    // reducer 返回值 === 上一次 → React 自动 bail-out，跳过渲染
    (_prev: T, snapshot: ChatState): T => selectorRef.current(snapshot),
    undefined as unknown as T,
    () => selector(core.getState()),
  );

  useEffect(() => {
    // 挂载后立即同步一次，防止 render → effect 之间 core 已变化
    dispatch(core.getState());
    return core.subscribe(() => dispatch(core.getState()));
  }, []);

  return value;
}

// ── 根组件 ────────────────────────────────────────────────────────────────────
export function ReactChatSelectorMemo() {
  const messageIds = useChatSelector((s) => s.messageIds);
  const streaming = useChatSelector((s) => s.streaming);
  const [text, setText] = useState('');

  const send = useCallback(() => {
    if (!text.trim()) return;
    core.send(text);
    setText('');
  }, [text]);

  return (
    <div>
      {messageIds.map((id) => (
        <MessageView key={id} id={id} />
      ))}
      <div>
        <input value={text} onChange={(e) => setText(e.target.value)} />
        <button onClick={send} disabled={streaming}>发送</button>
        {streaming && <button onClick={() => core.abort()}>停止</button>}
      </div>
    </div>
  );
}

// ── 子组件：React.memo + selector 双重防线 ────────────────────────────────────
// 第一道：React.memo —— 父组件重渲、props(id) 不变时跳过
// 第二道：useChatSelector bail-out —— selector 结果引用不变时跳过
const MessageView = React.memo(function MessageView({ id }: { id: string }) {
  // messages[id] 引用不变（其他消息更新）→ bail-out
  const msg = useChatSelector((s) => s.messages[id]);
  return (
    <div data-role={msg.role}>
      {msg.blockIds.map((bid) => (
        <BlockView key={bid} id={bid} />
      ))}
    </div>
  );
});

const BlockView = React.memo(function BlockView({ id }: { id: string }) {
  // 流式输出时只有当前 block 引用变化，其他 BlockView 全部 bail-out
  const block = useChatSelector((s) => s.blocks[id]);
  if (block.type === 'tool') {
    return <div className="tool">tool {block.name}({block.argsText}) [{block.status}]</div>;
  }
  return <div className="text">{block.text}</div>;
});
