/* @flow */

import { emptyObject } from 'shared/util'
import { parseFilters } from './parser/filter-parser'

export function baseWarn (msg: string) {
  console.error(`[Vue compiler]: ${msg}`)
}

/** 提取模块功能 */
export function pluckModuleFunction<F: Function> (
  modules: ?Array<Object>,
  key: string
): Array<F> {
  return modules
    ? modules.map(m => m[key]).filter(_ => _)
    : []
}

export function addProp (el: ASTElement, name: string, value: string) {
  (el.props || (el.props = [])).push({ name, value })
  el.plain = false
}

export function addAttr (el: ASTElement, name: string, value: any) {
  (el.attrs || (el.attrs = [])).push({ name, value })
  el.plain = false
}

// add a raw attr (use this in preTransforms)
export function addRawAttr (el: ASTElement, name: string, value: any) {
  el.attrsMap[name] = value
  el.attrsList.push({ name, value })
}

export function addDirective (
  el: ASTElement,
  name: string,
  rawName: string,
  value: string,
  arg: ?string,
  modifiers: ?ASTModifiers
) {
  (el.directives || (el.directives = [])).push({ name, rawName, value, arg, modifiers })
  el.plain = false
}

/** 添加事件的工具函数 */
export function addHandler (
  el: ASTElement,
  name: string,
  value: string,
  modifiers: ?ASTModifiers,
  important?: boolean, // 向前还是向后添加handler
  warn?: Function
) {
  modifiers = modifiers || emptyObject // 修饰符
  // warn prevent and passive modifier
  /* istanbul ignore if */
  if (
    process.env.NODE_ENV !== 'production' && warn &&
    modifiers.prevent && modifiers.passive
  ) {
    warn(
      'passive and prevent can\'t be used together. ' +
      'Passive handler can\'t prevent default event.'
    )
  }

  /** 三个特殊的修饰符的处理 */
  // check capture modifier
  if (modifiers.capture) { // 使用事件捕获模式 (内部事件触发前先触发该事件)
    delete modifiers.capture
    name = '!' + name // mark the event as captured
  }
  if (modifiers.once) {
    delete modifiers.once
    name = '~' + name // mark the event as once 单次事件
  }
  /* istanbul ignore if */
  if (modifiers.passive) {
    // 提高移动设备的性能尤其有用。(某一事件即将触发时候调用,在触发事件前调用提高性能)
    delete modifiers.passive
    name = '&' + name // mark the event as passive
  }

  // normalize click.right and click.middle since they don't actually fire
  // this is technically browser-specific, but at least for now browsers are
  // the only target envs that have right/middle clicks.
  // 规范化click.right和click.middle，因为它们实际上不触发，这在技术上是特定于浏览器的，
  // 但至少现在浏览器是唯一具有右键/中键单击的目标env。
  if (name === 'click') {
    if (modifiers.right) {
      name = 'contextmenu'
      delete modifiers.right
    } else if (modifiers.middle) {
      name = 'mouseup'
    }
  }

  let events // 区分nativeEvent和event添加对应事件的处理
  if (modifiers.native) {
    delete modifiers.native
    events = el.nativeEvents || (el.nativeEvents = {})
  } else {
    events = el.events || (el.events = {})
  }

  /** 组装事件处理体(value)和修饰符(modifiers) */
  const newHandler: any = {
    value: value.trim()
  }
  if (modifiers !== emptyObject) {
    newHandler.modifiers = modifiers
  }

  const handlers = events[name]
  /** 对对应的事件进行处理
   * 1.是一个数组区分important进行向前添加还是向后添加
   * 2.不是一个数组但是有同样name的事件,区分important,形成一个有调用顺序的数组
   * 3.直接添加handler
   */
  /* istanbul ignore if */
  if (Array.isArray(handlers)) {
    important ? handlers.unshift(newHandler) : handlers.push(newHandler)
  } else if (handlers) {
    events[name] = important ? [newHandler, handlers] : [handlers, newHandler]
  } else {
    events[name] = newHandler
  }

  el.plain = false // 修改plain属性有何用?
}

/** 获取绑定的值或者静态值 （多重查找）*/
export function getBindingAttr (
  el: ASTElement,
  name: string,
  getStatic?: boolean
): ?string {
  const dynamicValue = // 先获取属性中函数的特定值
    getAndRemoveAttr(el, ':' + name) ||
    getAndRemoveAttr(el, 'v-bind:' + name)
  if (dynamicValue != null) { // 如果能够获取值那么过滤并返回
    return parseFilters(dynamicValue) // 这是用来过滤什么？
  } else if (getStatic !== false) { // 如果获取静态值不为假
    const staticValue = getAndRemoveAttr(el, name) // 获取静态的值
    if (staticValue != null) { // 严谨判断值存在（因为值为null是一个obj也是可以转化的）
      return JSON.stringify(staticValue) // 转化为字符串后返回
    }
  }
}

// note: this only removes the attr from the Array (attrsList) so that it
// doesn't get processed by processAttrs.
// 这只会从数组（attrslist）中删除attr，这样它就不会被processattr处理。
// By default it does NOT remove it from the map (attrsMap) because the map is
// needed during codegen.
// 默认情况下，它不会将其从映射（attrsmap）中删除，因为在codegen期间需要映射。
export function getAndRemoveAttr ( //（指定名字查找）
  el: ASTElement,
  name: string,
  removeFromMap?: boolean
): ?string {
  // 用于获取制定name的attribute并删除attrsList中的值
  // 若removeFromMap为true时候attrsMap也会中的值也会被删除
  let val
  if ((val = el.attrsMap[name]) != null) {
    const list = el.attrsList
    for (let i = 0, l = list.length; i < l; i++) {
      if (list[i].name === name) {
        list.splice(i, 1)
        break
      }
    }
  }
  if (removeFromMap) {
    delete el.attrsMap[name]
  }
  return val
}
