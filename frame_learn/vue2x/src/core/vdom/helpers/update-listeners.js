/* @flow */

import { warn } from 'core/util/index'
import { cached, isUndef, isPlainObject } from 'shared/util'

const normalizeEvent = cached((name: string): {
  name: string,
  once: boolean,
  capture: boolean,
  passive: boolean,
  handler?: Function,
  params?: Array<any>
} => {
  const passive = name.charAt(0) === '&'
  name = passive ? name.slice(1) : name
  const once = name.charAt(0) === '~' // Prefixed last, checked first
  name = once ? name.slice(1) : name
  const capture = name.charAt(0) === '!'
  name = capture ? name.slice(1) : name
  return {
    name,
    once,
    capture,
    passive
  }
})

/** 对调用的fn进行一层包装 */
export function createFnInvoker (fns: Function | Array<Function>): Function {
  function invoker () {
    const fns = invoker.fns
    if (Array.isArray(fns)) {
      const cloned = fns.slice()
      for (let i = 0; i < cloned.length; i++) {
        cloned[i].apply(null, arguments)
      }
    } else {
      // return handler return value for single handlers
      return fns.apply(null, arguments)
    }
  }
  invoker.fns = fns
  return invoker
}

/** 更新事件
 * 1. 枚举on --> 进行新的事件绑定或者改变fns的值,因为绑定事件前经过了createFnInvoker对fn调用进行了包装
 *  (很好的利用了作用域和内存指针的关系,以及优化了性能不用多次调用绑定)
 * 2. 最后枚举oldOn --> 移除旧没有对应没有name的事件
 */
export function updateListeners (
  on: Object,
  oldOn: Object,
  add: Function,
  remove: Function,
  vm: Component
) {
  let name, def, cur, old, event
  for (name in on) { // 枚举需要绑定的事件
    def = cur = on[name]
    old = oldOn[name]
    event = normalizeEvent(name) // 对&、~、！进行处理
    /* istanbul ignore if */
    if (__WEEX__ && isPlainObject(def)) {
      cur = def.handler
      event.params = def.params
    }
    if (isUndef(cur)) {
      process.env.NODE_ENV !== 'production' && warn(
        `Invalid handler for event "${event.name}": got ` + String(cur),
        vm
      )
    } else if (isUndef(old)) {
      // 如果old事件没有 ==> 添加事件（cur\cur.fns）
      if (isUndef(cur.fns)) {
        cur = on[name] = createFnInvoker(cur)
      }
      // 事件名 、 事件 、 是否单次事件
      add(event.name, cur, event.once, event.capture, event.passive, event.params)
    } else if (cur !== old) { // 有old且不一样 更新（注意更新是更新old.fns）
      old.fns = cur
      on[name] = old
    }
  }
  // 遍历一次oldOn 映射 on 如果没有则移除
  for (name in oldOn) {
    if (isUndef(on[name])) {
      event = normalizeEvent(name)
      remove(event.name, oldOn[name], event.capture)
    }
  }
}
