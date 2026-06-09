// ===========================================================================
// Core 层 —— 通用的可观察 store。这是"观察者模式"的本体,完全框架无关。
// 各框架绑定都建立在它的 subscribe / getState 之上。
// ===========================================================================

type Listener = () => void;

export interface Store<T> {
  getState: () => T;
  setState: (updater: (prev: T) => T) => void;
  subscribe: (listener: Listener) => () => void;  // 返回退订函数
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener>();

  return {
    getState: () => state,
    setState: (updater) => {
      const next = updater(state);
      if (next === state) return;      // 引用没变就不通知
      state = next;
      listeners.forEach((l) => l());   // 通知所有订阅者:去重读吧
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
