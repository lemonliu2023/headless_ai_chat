# AI 对话 · headless core 跨端示例

一份框架无关的 core,React / Vue / 小程序三端都可以直接接它。
核心只负责状态、流式解析和传输端口;各端示例只演示怎么消费 core。

```
core/        ← Core(纯 TS,零框架零平台,三端共用)
  types.ts       领域类型 + 适配器端口(Transport / Storage)+ 规范化 StreamEvent
  store.ts       通用可观察 store(Observer 模式)
  state.ts       ChatState 的不可变迁移(结构共享 → 细粒度订阅生效)
  sse.ts         SSE 解析器(字节边界 buffer → StreamEvent)
  chat.ts        ChatCore 门面(Facade):编排 store + sse + transport
  transport.ts   Transport 适配器:Mock(可跑)/ Fetch(Web)/ Wx(小程序示意)

examples/    ← 三端接入示例(不作为独立架构层)
  react/
    ReactChat.tsx      useSyncExternalStore 直接接 core
  vue/
    VueChat.vue        subscribe → shallowRef
  miniprogram/
    chat-page.ts       subscribe → setData(批量)

demo/
  run-core.ts    在 Node 里跑纯 core,证明零框架可用
```

## core 暴露什么
`ChatCore` 是主要入口:

```ts
const core = new ChatCore(transport);

core.subscribe(() => {
  const state = core.getState();
});

core.send('hello');
core.abort();
```

- `send(text)`:追加用户消息,创建 assistant 消息,通过 `Transport` 发起流式请求。
- `abort()`:停止当前流式请求,并把 `streaming` 置回 `false`。
- `subscribe(listener)`:订阅状态变化,返回退订函数。
- `getState()`:读取当前 `ChatState` 快照。

真实请求只需要实现 `Transport`:

```ts
interface Transport {
  send(input: TransportInput, handlers: TransportHandlers): AbortHandle;
}
```

## 设计模式
- 整体:端口与适配器 / 六边形架构(领域逻辑在中心,平台/框架在边缘)
- Adapter:Transport
- Observer:store 的 subscribe/notify
- 依赖倒置/注入:core 定义 Transport/Storage 接口,各端注入实现
- Facade:ChatCore 对外统一 API

## 跑纯 core(无需任何框架)
```bash
npm i -D tsx
npx tsx demo/run-core.ts
```

## 换成真实大模型
把 `new MockTransport()` 换成 `new FetchTransport(url, headers)` 即可,core 不动。

## 本示例为聚焦架构而省略的部分
流式 Markdown 渲染与高亮、虚拟列表、滚动控制器、本地持久化(Storage 端口已留)、
错误/重试/重新生成 —— 都属于"在这套分层里继续往 core 或适配器里加"的范畴。
