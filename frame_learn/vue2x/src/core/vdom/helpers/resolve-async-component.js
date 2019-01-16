/* @flow */

import {
  warn,
  once,
  isDef,
  isUndef,
  isTrue,
  isObject,
  hasSymbol
} from 'core/util/index'

import { createEmptyVNode } from 'core/vdom/vnode'

function ensureCtor (comp: any, base) {
  if (
    comp.__esModule ||
    (hasSymbol && comp[Symbol.toStringTag] === 'Module')
  ) {
    comp = comp.default
  }
  return isObject(comp)
    ? base.extend(comp)
    : comp
}

/* 创建异步的占位符节点（一个注释节点） **/
export function createAsyncPlaceholder (
  factory: Function,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag: ?string
): VNode {
  const node = createEmptyVNode()
  node.asyncFactory = factory
  node.asyncMeta = { data, context, children, tag }
  return node
}

export function resolveAsyncComponent (
  factory: Function,
  baseCtor: Class<Component>,
  context: Component
): Class<Component> | void {
  // 当前状态是错误返回错误处理的组件
  if (isTrue(factory.error) && isDef(factory.errorComp)) {
    return factory.errorComp
  }
  // 当前已完成返回resolved
  if (isDef(factory.resolved)) {
    return factory.resolved
  }
  // 当前正在加载返回正在加载的组件
  if (isTrue(factory.loading) && isDef(factory.loadingComp)) {
    return factory.loadingComp
  }

  if (isDef(factory.contexts)) { // 正在等待中会走到这里
    // already pending
    factory.contexts.push(context)
  } else {
    // 保存上下文
    const contexts = factory.contexts = [context]
    let sync = true //设置状态

    const forceRender = () => { // 组装强制渲染的函数
      for (let i = 0, l = contexts.length; i < l; i++) {
        contexts[i].$forceUpdate()
      }
    }

    // 组装一次执行的resolve函数(成功时候的处理)
    const resolve = once((res: Object | Class<Component>) => {
      // cache resolved
      factory.resolved = ensureCtor(res, baseCtor)
      // invoke callbacks only if this is not a synchronous resolve
      // (async resolves are shimmed as synchronous during SSR)
      // 只有在这不是同步解析时才调用回调(异步解析在SSR期间以同步的方式进行调整)
      if (!sync) {
        forceRender() // 强制渲染
      }
    })

    // 组装一次执行的reject函数（错误时候的处理）
    const reject = once(reason => {
      process.env.NODE_ENV !== 'production' && warn(
        `Failed to resolve async component: ${String(factory)}` +
        (reason ? `\nReason: ${reason}` : '')
      )
      if (isDef(factory.errorComp)) {
        factory.error = true //状态改为error
        forceRender() // 强制渲染
      }
    })

    const res = factory(resolve, reject) // 调用传入的函数。并传入组装好的函数

    if (isObject(res)) { // 如果有返回值而是是一个对象
      if (typeof res.then === 'function') { // 对promise的解析成功直接调用
        // () => Promise
        if (isUndef(factory.resolved)) {
          res.then(resolve, reject)
        }
        // 返回值含有component而且是一个promise
      } else if (isDef(res.component) && typeof res.component.then === 'function') {
        res.component.then(resolve, reject)

        // 对错误组件的解析
        if (isDef(res.error)) {
          factory.errorComp = ensureCtor(res.error, baseCtor)
        }

        // 对正在加载时候调用组件的解析
        if (isDef(res.loading)) {
          factory.loadingComp = ensureCtor(res.loading, baseCtor)
          if (res.delay === 0) { // 等待时间为0直接加载中
            factory.loading = true
          } else {
            // 否则200毫秒或者自定义
            setTimeout(() => {
              if (isUndef(factory.resolved) && isUndef(factory.error)) {
                factory.loading = true
                forceRender()
              }
            }, res.delay || 200)
          }
        }

        // 请求超时的解析和处理
        if (isDef(res.timeout)) {
          setTimeout(() => {
            if (isUndef(factory.resolved)) {
              reject(
                process.env.NODE_ENV !== 'production'
                  ? `timeout (${res.timeout}ms)`
                  : null
              )
            }
          }, res.timeout)
        }
      }
    }

    sync = false
    // return in case resolved synchronously
    return factory.loading // 返回现在应该执行的comp
      ? factory.loadingComp
      : factory.resolved
  }
}
