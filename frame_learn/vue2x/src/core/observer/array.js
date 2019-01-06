/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

const arrayProto = Array.prototype
export const arrayMethods = Object.create(arrayProto)

const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 * 截获能够改变数组的方法并发出事件
 */
methodsToPatch.forEach(function (method) {
  // cache original method 存储原始方法
  const original = arrayProto[method]
  def(arrayMethods, method, function mutator (...args) {
    const result = original.apply(this, args)
    const ob = this.__ob__ // 拿储存的观察者
    let inserted
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args // 插入的数据
        break
      case 'splice':
        inserted = args.slice(2) // 插入（更新）的数据
        break
    }
    if (inserted) ob.observeArray(inserted) //观测新数据
    // notify change
    ob.dep.notify() // 调用更新
    return result
  })
})
