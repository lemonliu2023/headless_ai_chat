// ===========================================================================
// 适配器层 —— Transport 的具体实现。每个平台一个适配器,都实现同一个端口。
//   · MockTransport     —— 本地模拟流,用于 demo / 测试(可在 Node 直接跑)
//   · FetchTransport    —— Web / H5:fetch + ReadableStream
//   · WxTransport       —— 微信小程序:wx.request({ enableChunked })(示意)
// ===========================================================================

import type { Transport, TransportInput, TransportHandlers, AbortHandle } from './types.ts';

// --------------------------- Mock(可运行) ---------------------------------
// 模拟一段大模型流:先流式输出一段文本,再发起一次工具调用(参数流式拼 JSON),
// 故意把部分事件拆在 chunk 中间,演示 SSE buffer 的边界处理。
export class MockTransport implements Transport {
  send(_input: TransportInput, h: TransportHandlers): AbortHandle {
    const sse = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;

    const text = '好的,我帮你查一下上海的天气。';
    const chunks: string[] = [];
    chunks.push(sse({ t: 'start', i: 0, block: { type: 'text' } }));
    for (const ch of text) chunks.push(sse({ t: 'text', i: 0, d: ch }));
    chunks.push(sse({ t: 'stop', i: 0 }));
    // 工具调用:参数 JSON 分多段流式拼(中途是非法 JSON)
    chunks.push(sse({ t: 'start', i: 1, block: { type: 'tool', name: 'get_weather' } }));
    chunks.push(sse({ t: 'args', i: 1, d: '{"city":' }));
    chunks.push(sse({ t: 'args', i: 1, d: '"上海"}' }));
    chunks.push(sse({ t: 'stop', i: 1 }));
    chunks.push(sse({ t: 'done' }));

    // 把所有事件拼成一条长文本,再"乱切"成不对齐事件边界的小块,逐块吐出
    const wire = chunks.join('');
    const pieces: string[] = [];
    for (let p = 0; p < wire.length; p += 7) pieces.push(wire.slice(p, p + 7));

    let i = 0;
    let stopped = false;
    const timer = setInterval(() => {
      if (stopped) return;
      if (i >= pieces.length) {
        clearInterval(timer);
        h.onDone();
        return;
      }
      h.onChunk(pieces[i++]);
    }, 15);

    return { abort: () => { stopped = true; clearInterval(timer); } };
  }
}

// --------------------------- Fetch(Web / H5) ------------------------------
export class FetchTransport implements Transport {
  constructor(private url: string, private headers: Record<string, string> = {}) {}

  send(input: TransportInput, h: TransportHandlers): AbortHandle {
    const ctrl = new AbortController();
    (async () => {
      try {
        const resp = await fetch(this.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...this.headers },
          body: JSON.stringify(input),
          signal: ctrl.signal,
        });
        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          h.onChunk(decoder.decode(value, { stream: true })); // 流式解码,不拆坏多字节
        }
        h.onDone();
      } catch (err) {
        if ((err as Error).name !== 'AbortError') h.onError(err);
      }
    })();
    return { abort: () => ctrl.abort() };  // 适配到 AbortController
  }
}

// --------------------------- 微信小程序(示意) ------------------------------
// 小程序没有 fetch/流,用 wx.request enableChunked + onChunkReceived,
// chunk 是 ArrayBuffer,自己解码。仅示意,放在小程序工程里才能跑。
/*
export class WxTransport implements Transport {
  constructor(private url: string) {}
  send(input: TransportInput, h: TransportHandlers): AbortHandle {
    const task = wx.request({
      url: this.url, method: 'POST', enableChunked: true,
      header: { 'Content-Type': 'application/json' }, data: input,
      success: () => h.onDone(), fail: (e) => h.onError(e),
    });
    const decoder = new TextDecoder();
    task.onChunkReceived((res) => h.onChunk(decoder.decode(new Uint8Array(res.data))));
    return { abort: () => task.abort() };  // 适配到 requestTask.abort()
  }
}
*/
