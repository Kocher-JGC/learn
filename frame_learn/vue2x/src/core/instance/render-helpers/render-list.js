/* @flow */

import { isObject, isDef } from 'core/util/index'

/**
 * Runtime helper for rendering v-for lists.
 * 渲染列表的函数 （可以渲染数组、可以给一个数字重复多少次、可以枚举渲染对象）
 */
export function renderList (
  val: any,
  render: (
    val: any,
    keyOrIndex: string | number,
    index?: number
  ) => VNode
): ?Array<VNode> {
  let ret: ?Array<VNode>, i, l, keys, key
  // 传入的val是一个数组、render渲染数组每个元素
  if (Array.isArray(val) || typeof val === 'string') {
    ret = new Array(val.length)
    for (i = 0, l = val.length; i < l; i++) {
      ret[i] = render(val[i], i)
    }
    // 传入的val是一个数字（重复渲染的多少次）
  } else if (typeof val === 'number') {
    ret = new Array(val)
    for (i = 0; i < val; i++) {
      ret[i] = render(i + 1, i)
    }
    // 传入的是一个对象（枚举对象每个key来渲染）
  } else if (isObject(val)) {
    keys = Object.keys(val)
    ret = new Array(keys.length)
    for (i = 0, l = keys.length; i < l; i++) {
      key = keys[i]
      ret[i] = render(val[key], key, i)
    }
  }
  // 标志一下ret是一个list
  if (isDef(ret)) {
    (ret: any)._isVList = true
  }
  return ret
}
