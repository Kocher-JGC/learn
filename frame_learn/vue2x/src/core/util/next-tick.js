/* @flow */
/* globals MessageChannel */

import { noop } from 'shared/util'
import { handleError } from './error'
import { isIOS, isNative } from './env'

const callbacks = []
let pending = false

// 主动调用callbacks
function flushCallbacks () {
  pending = false
  const copies = callbacks.slice(0)
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// Here we have async deferring wrappers using both microtasks and (macro) tasks.
// In < 2.4 we used microtasks everywhere, but there are some scenarios where
// microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690) or even between bubbling of the same
// event (#6566). However, using (macro) tasks everywhere also has subtle problems
// when state is changed right before repaint (e.g. #6813, out-in transitions).
// Here we use microtask by default, but expose a way to force (macro) task when
// needed (e.g. in event handlers attached by v-on).
/** 一个只与基元键一起使用的非标准集合polyfill。
 * 这里我们有同时使用微任务和（宏）任务的异步延迟包装器。
 * 在<2.4中，我们到处使用微任务，但在某些情况下，微任务的优先级太高，
 * 在假定的连续事件（例如#4521、#6690）之间，甚至在同一事件的冒泡之间（#6566）。
 * 但是，在重新绘制之前更改状态时（例如#6813，在转换中退出），到处使用（宏）任务也会有一些微妙的问题。
 * 这里，我们默认使用微任务，但在需要时公开强制（宏）任务的方法（例如V-ON附加的事件处理程序）。
**/
let microTimerFunc // 微型
let macroTimerFunc // 巨型
let useMacroTask = false

// Determine (macro) task defer implementation.
// Technically setImmediate should be the ideal choice, but it's only available
// in IE. The only polyfill that consistently queues the callback after all DOM
// events triggered in the same loop is by using MessageChannel.
// 确定（宏）任务延迟实现。从技术上讲，setimmediate应该是理想的选择，
// 但它仅在IE中可用。在同一循环中触发所有DOM事件后，
// 唯一一致地对回调进行排队的polyfill是使用messagechannel。
/* istanbul ignore if */
/** setImmediate:该方法可以用来替代 setTimeout(0) 方法来滞后完成一些需要占用大量cpu时间的操作 **/
if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  macroTimerFunc = () => {
    setImmediate(flushCallbacks)
  }
  // MessageChannel 创建信息通道发送信息
} else if (typeof MessageChannel !== 'undefined' && (
  isNative(MessageChannel) ||
  // PhantomJS
  MessageChannel.toString() === '[object MessageChannelConstructor]'
)) {
  const channel = new MessageChannel()
  const port = channel.port2
  channel.port1.onmessage = flushCallbacks
  macroTimerFunc = () => {
    port.postMessage(1)
  }
} else {
  /* istanbul ignore next */
  macroTimerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

// Determine microtask defer implementation. //确定微任务延迟实现。
/* istanbul ignore next, $flow-disable-line */
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  const p = Promise.resolve()
  microTimerFunc = () => {
    p.then(flushCallbacks)
    // in problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.
    /** 在有问题的uiwebview中，promise.then不会完全中断，
     * 但它可能会陷入一种奇怪的状态，即回调被推到微任务队列中，
     * 但队列不会被刷新，直到浏览器需要做一些其他工作，例如处理计时器。
     * 因此，我们可以通过添加一个空计时器来“强制”刷新微任务队列。
    **/
    if (isIOS) setTimeout(noop)
  }
} else {
  // fallback to macro
  microTimerFunc = macroTimerFunc
}

/**
 * Wrap a function so that if any code inside triggers state change,
 * the changes are queued usizuoyng a (macro) task instead of a microtask.
 * 包装一个函数，这样当触发器中的任何代码状态发生变化时，这些变化将使用（宏）任务而不是微任务排队。
 * 作用：？
 */
export function withMacroTask (fn: Function): Function {
  return fn._withTask || (fn._withTask = function () {
    useMacroTask = true
    const res = fn.apply(null, arguments)
    useMacroTask = false
    return res
  })
}

// nextTick 执⾏所有 watcher 的run ，最后执⾏它们的回调函数
export function nextTick (cb?: Function, ctx?: Object) {
  let _resolve
  // 没调用一次添加一次cb么。为什么？
  callbacks.push(() => {
    // 有cb调用cb没有调用promise.resolve
    if (cb) {
      try {
        cb.call(ctx)
      } catch (e) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      _resolve(ctx)
    }
  })
  if (!pending) {
    pending = true // 标记正在执行
    if (useMacroTask) {
      macroTimerFunc()
    } else {
      microTimerFunc()
    }
    // 执行flushCallbacks的时候等待改为false
  }
  // $flow-disable-line
  // 可以执行promise的执行promise
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
