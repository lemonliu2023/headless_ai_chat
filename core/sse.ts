// ===========================================================================
// Core 层 —— SSE 解析器。把"文本块"流(来自任意平台的 Transport)解析成
// 规范化的 StreamEvent。SSE 的格式是平台无关的,所以这层可共用;
// 只有"怎么拿到字节"由各平台 Transport 适配。
// ===========================================================================

import type { StreamEvent } from './types.ts';

export interface SSEParser {
  feed(textChunk: string): void;
}

export function createSSEParser(onEvent: (e: StreamEvent) => void): SSEParser {
  let buffer = '';

  return {
    feed(textChunk: string) {
      buffer += textChunk;

      // chunk 不按事件边界来:按 \n\n 切出完整事件,残缺的留在 buffer 等下一块
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);

        // 一个事件里可能有多行,取 data: 拼起来
        let data = '';
        for (const line of raw.split('\n')) {
          if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (!data || data === '[DONE]') continue;

        try {
          onEvent(JSON.parse(data) as StreamEvent);
        } catch {
          /* 单个事件坏掉就跳过,不让整条流崩 */
        }
      }
    },
  };
}
