// ===========================================================================
// React 示例 —— 直接消费 headless core。
// 关键点:React 只需要把 core.subscribe / core.getState 接到 useSyncExternalStore。
// ===========================================================================

import React, { useState, useSyncExternalStore } from 'react';
import { ChatCore } from '../../core/chat.ts';
import { MockTransport } from '../../core/transport.ts';
import type { ChatState } from '../../core/types.ts';

const core = new ChatCore(new MockTransport());

function useChat<T>(selector: (s: ChatState) => T): T {
  const state = useSyncExternalStore(core.subscribe, core.getState, core.getState);
  return selector(state);
}

export function ReactChat() {
  const messageIds = useChat((s) => s.messageIds);
  const streaming = useChat((s) => s.streaming);
  const [text, setText] = useState('');

  const send = () => {
    if (!text.trim()) return;
    core.send(text);
    setText('');
  };

  return (
    <div>
      {messageIds.map((id) => <MessageView key={id} id={id} />)}
      <div>
        <input value={text} onChange={(e) => setText(e.target.value)} />
        <button onClick={send} disabled={streaming}>发送</button>
        {streaming && <button onClick={() => core.abort()}>停止</button>}
      </div>
    </div>
  );
}

const MessageView = React.memo(function MessageView({ id }: { id: string }) {
  const msg = useChat((s) => s.messages[id]);
  return (
    <div data-role={msg.role}>
      {msg.blockIds.map((bid) => <BlockView key={bid} id={bid} />)}
    </div>
  );
});

const BlockView = React.memo(function BlockView({ id }: { id: string }) {
  const block = useChat((s) => s.blocks[id]);
  if (block.type === 'tool') {
    return <div className="tool">tool {block.name}({block.argsText}) [{block.status}]</div>;
  }
  return <div className="text">{block.text}</div>;
});
