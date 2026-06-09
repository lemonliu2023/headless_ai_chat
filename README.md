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

---

## 各端渲染机制对比与设计笔记

### 批量更新：三端殊途同归

流式输出时 core 状态变化极频繁，三端都需要合并多次变化为一次渲染，避免闪烁：

| 端 | 机制 | 实现 |
|---|---|---|
| 小程序 | 手写 `scheduled` 标志 + microtask | `Promise.resolve().then(flush)` |
| Vue | 内置调度器，自动批处理 | 响应式系统自动合并 |
| React | 内置批处理（React 18） | `useState` / `useReducer` 自动合并 |

小程序的 `scheduled` 模式（`chat-page.ts:26`）是 Vue/React 调度器的手写简化版：同一轮次多次触发只排一个 microtask，flush 时读最终状态，跳过所有中间状态。

### React 三种接入方式的演进

```
examples/react/
  ReactChat.tsx            useSyncExternalStore（原版）
  ReactChatReducer.tsx     useReducer + Context（状态移入 React 内部）
  ReactChatSelectorMemo.tsx  selector + memo（精确渲染优化）
```

**ReactChat.tsx — `useSyncExternalStore`**

直接把 `core.subscribe` / `core.getState` 接入 React。问题在于：React 18 并发渲染可以被打断，打断期间外部 store 若发生变化，不同组件会读到不同时刻的数据（撕裂/tearing）。`useSyncExternalStore` 通过检测撕裂、强制降级为同步渲染来保证一致性，代价是并发渲染优势打折。

**ReactChatReducer.tsx — `useReducer` + Context**

把状态"拉进" React 内部：core 变化只触发 `dispatch`，快照由 React 自己管理，同一次渲染里所有组件读同一份 state，天然无撕裂。用 Context 向下分发避免 prop drilling，但 Context 整体变化会触发所有消费者重渲，`React.memo` 对此无效。

**ReactChatSelectorMemo.tsx — selector + `useReducer` bail-out**

每个组件独立订阅，用 selector 声明"我只关心哪块数据"。依赖 `core/state.ts` 的结构共享（只换变化部分的引用），`useReducer` 的 bail-out 机制（返回值 `Object.is` 不变则跳过渲染）实现精确渲染。流式输出 100 个 block 时，每个 token 只有 1 个 BlockView 重渲。

### Prop Drilling 的渲染代价

中间层组件不消费某个 prop，仅作为"快递员"传给子组件，会导致：
- 该 prop 变化时，中间层即使不关心也会重渲（`React.memo` 只比较 props，快递员的 props 变了）
- 层级越深，一次状态变化触发的无效渲染越多

selector 方案让每个组件直接订阅所需数据，中间层不持有无关 prop，彻底避免此问题。

### Vue vs React 适用场景

| | Vue | React |
|---|---|---|
| 精确渲染 | 响应式系统自动追踪依赖，默认精确 | 需要手动 selector + memo |
| 并发渲染 | 无 | `startTransition` 区分紧急/非紧急更新 |
| 心智负担 | 低，框架替你做优化 | 高，需主动管理渲染 |
| 适合场景 | 快速迭代、展示为主 | 大型应用、极端性能、并发交互 |

流式 AI 场景中，React 的 `startTransition` 可将"渲染流式消息"标记为低优先级，保证输入框始终即时响应；Vue 目前无等价能力。

### `useChatSelector` 的 `useRef` + `useReducer` 组合

`ReactChatSelectorMemo.tsx` 中的核心 hook 用到两个关键技巧：

1. **`selectorRef`**：selector 函数每次渲染都是新引用，但 `useEffect` 依赖为空只注册一次订阅。用 ref 存最新 selector，订阅回调通过 `selectorRef.current` 访问，保证闭包里永远拿到最新版本。

2. **`useReducer` 作存储**：`dispatch` 传入整个 `ChatState` 快照，reducer 用 selector 算出组件关心的值。React 内置 bail-out：reducer 返回值与上次 `Object.is` 相等则跳过渲染，无需手动比较。
