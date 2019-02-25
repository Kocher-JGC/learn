/* @flow */

import type Router from '../index'
import { History } from './base'

export class AbstractHistory extends History {
  index: number;
  stack: Array<Route>;

  constructor (router: Router, base: ?string) {
    super(router, base)
    // 利用一个index全局记录是好还是不好
    this.stack = []
    this.index = -1
  }

  // 完成的时候向栈添加新的route，更新index
  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    this.transitionTo(location, route => {
      this.stack = this.stack.slice(0, this.index + 1).concat(route)
      this.index++
      onComplete && onComplete(route)
    }, onAbort)
  }

  // 把最后一个栈替换调
  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    this.transitionTo(location, route => {
      this.stack = this.stack.slice(0, this.index).concat(route)
      onComplete && onComplete(route)
    }, onAbort)
  }

  go (n: number) {
    const targetIndex = this.index + n // 目标位置[因为有个index记录]
    if (targetIndex < 0 || targetIndex >= this.stack.length) { // 不在记录中
      return
    }
    // 拿到记录的route
    const route = this.stack[targetIndex]
    // 转换个更新route
    this.confirmTransition(route, () => {
      this.index = targetIndex
      this.updateRoute(route)
    })
  }

  // 获取原始所有url
  getCurrentLocation () {
    const current = this.stack[this.stack.length - 1]
    return current ? current.fullPath : '/'
  }

  ensureURL () {
    // noop
  }
}
