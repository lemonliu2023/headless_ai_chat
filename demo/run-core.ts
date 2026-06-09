// ===========================================================================
// Demo —— 在 Node 里直接跑【纯 core】,不引入任何框架。
// 用它证明:headless core 真的零框架零平台可独立运行。
// 运行:node --experimental-strip-types demo/run-core.ts
// ===========================================================================

import { ChatCore } from '../core/chat.ts';
import { MockTransport } from '../core/transport.ts';

const core = new ChatCore(new MockTransport());

// 像任意框架绑定那样订阅;这里我们就打印当前状态快照
let lastLine = '';
core.subscribe(() => {
  const s = core.getState();
  // 把整个对话渲染成纯文本(模拟"UI")
  const view = s.messageIds
    .map((mid) => {
      const m = s.messages[mid];
      const body = m.blockIds
        .map((bid) => {
          const b = s.blocks[bid];
          return b.type === 'tool'
            ? `🔧 ${b.name}(${b.argsText})${b.status === 'done' ? ` ✓ args=${JSON.stringify(b.args)}` : ' …'}`
            : b.text;
        })
        .join(' | ');
      return `${m.role === 'user' ? '我' : 'AI'}: ${body}`;
    })
    .join('\n');

  const line = view + (s.streaming ? '  [streaming]' : '  [done]');
  if (line !== lastLine) {
    console.clear();
    console.log(line);
    lastLine = line;
  }
});

core.send('上海天气怎么样?');
