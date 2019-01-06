/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'

let uid = 0 // 每一个得票 Instance 都有一个唯一uid

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 * DEP是一个可观察的，可以有多个指令订阅它。
 */
export default class Dep {
  static target: ?Watcher; // Dep的静态属性用于记录当前的Watcher
  id: number;
  /** 记录子Watcher
   * 疑问：1、记录这个子有什么用（更新的时候会更新所有子）
   * 2、为什么不记录父形成树
   * **/
  subs: Array<Watcher>;

  constructor () {
    this.id = uid++
    this.subs = []
  }

  addSub (sub: Watcher) {
    this.subs.push(sub)
  }

  removeSub (sub: Watcher) {
    remove(this.subs, sub) // 通过indexOf+splice来移除一个数组的元素
  }

  depend () {
    if (Dep.target) {
      Dep.target.addDep(this)
    }
  }

  notify () {
    // stabilize the subscriber list first
    const subs = this.subs.slice() // 复制一份子然后主动调用update
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

// the current target watcher being evaluated.
// this is globally unique because there could be only one
// watcher being evaluated at any time.
// 正在求值的当前目标观察程序。这是全局唯一的，因为在任何时候只能求值一个观察者。
Dep.target = null
const targetStack = []
/** 很好的利用的栈的特性（先入后出） **/

export function pushTarget (_target: ?Watcher) {
  if (Dep.target) targetStack.push(Dep.target)
  Dep.target = _target
}

export function popTarget () {
  Dep.target = targetStack.pop()
}
