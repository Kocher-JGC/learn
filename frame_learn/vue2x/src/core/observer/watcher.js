/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number; //每个watcher唯一一个uid
  deep: boolean;
  user: boolean;
  computed: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  dep: Dep;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    this.vm = vm
    if (isRenderWatcher) {// 渲染watcher
      vm._watcher = this
    }
    vm._watchers.push(this) // 实例的所有watcher
    // options
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user // 调用vm.$watch此项为true
      this.computed = !!options.computed // 计算属性init的时候传入
      this.sync = !!options.sync
      this.before = options.before // 在mountComponent的时候传入了beforeUpdate
    } else {
      this.deep = this.user = this.computed = this.sync = false
    }
    this.cb = cb // run的时候调用getAndInvoke
    this.id = ++uid // uid for batching
    this.active = true // 激活状态（记录该实例是否能够run）和取消订阅（teardown）
    this.dirty = this.computed // for computed watchers // 计算属性的watcher
    /** 下面4个用于记录当前实例deps的变化和含有deo的 **/
    this.deps = [] //..
    this.newDeps = [] //..
    this.depIds = new Set() //..
    this.newDepIds = new Set() //..
    //..
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // parse expression for getter 把表达式解析成getter
    // 函数直接赋值不是函数解析成函数
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = function () {}
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    // 计算属性延后渲染 但是会实例Dep
    if (this.computed) {
      this.value = undefined
      this.dep = new Dep()
    } else { // 否则调用get更新
      this.value = this.get()
    }
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  get () {
    pushTarget(this) // 改变记录的target为当前的
    let value
    const vm = this.vm
    try {
      value = this.getter.call(vm, vm) // 主动调用getter触发语法糖
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      // “接触”每一个属性，因此它们都被作为深度观察的依赖项进行跟踪。
      if (this.deep) {
        traverse(value) // 又不触发事件有什么用
      }
      popTarget() // 删除当前的target记录（pop最后一个push的）
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive. 向该指令添加依赖项。
   */
  addDep (dep: Dep) {
    const id = dep.id
    // 添加新的 记录id和dep
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) { // 检查没有再加
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection. 清除从属集合
   * 理解一下
   */
  cleanupDeps () {
    let i = this.deps.length
    // 旧的遍历一遍删除 新的dep没有的
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    // 为什么存了换过来然后再清空，而不是直接替换呢
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    // 这个也很有趣 新的变成旧的然后length为0
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   * 订阅者（用户）接口。当依赖项更改时将调用。
   */
  update () {
    /* istanbul ignore else */
    if (this.computed) {
      // A computed property watcher has two modes: lazy and activated.
      // It initializes as lazy by default, and only becomes activated when
      // it is depended on by at least one subscriber, which is typically
      // another computed property or a component's render function.
      // 计算属性观察程序有两种模式：惰性和激活。
      // 默认情况下，它初始化为lazy，只有当至少一个订阅服务器依赖于它时才会激活，
      // 订阅服务器通常是另一个计算属性或组件的呈现函数。
      if (this.dep.subs.length === 0) {
        // In lazy mode, we don't want to perform computations until necessary,
        // so we simply mark the watcher as dirty. The actual computation is
        // performed just-in-time in this.evaluate() when the computed property
        // is accessed.
        // 在懒惰模式下，我们不想在必要时执行计算，所以我们只是将观察者标记为被污染的。
        // 当访问computed属性时，实际计算将在this.evaluate（）中及时执行。
        this.dirty = true
      } else {
        // In activated mode, we want to proactively perform the computation
        // but only notify our subscribers when the value has indeed changed.
        // 在激活模式下，我们希望主动执行计算，但只在值确实发生更改时通知订户。
        this.getAndInvoke(() => {
          this.dep.notify()
        })
      }
    } else if (this.sync) {
      this.run()
    } else {
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run () {
    if (this.active) {
      this.getAndInvoke(this.cb)
    }
  }

  getAndInvoke (cb: Function) {
    const value = this.get() // 调用getter
    if (
      value !== this.value ||
      // 即使在值相同的情况下，对象/数组上的深度观察者和观察者也应该触发，因为值可能发生了变化。
      // Deep watchers and watchers on Object/Arrays should fire even
      // when the value is the same, because the value may
      // have mutated.
      isObject(value) ||
      this.deep // deep既然每次都触发
    ) {
      // set new value 设置新值
      const oldValue = this.value
      this.value = value
      this.dirty = false // 已经设置了值污染标志为false
      // 调用一下回调函数
      if (this.user) { // 是vm.$watch添加的try一下
        try {
          cb.call(this.vm, value, oldValue)
        } catch (e) {
          handleError(e, this.vm, `callback for watcher "${this.expression}"`)
        }
      } else {
        cb.call(this.vm, value, oldValue)
      }
    }
  }

  /**
   * Evaluate and return the value of the watcher.
   * This only gets called for computed property watchers.
   * 计算并返回观察程序的值。仅对计算属性观察程序调用此值。
   */
  evaluate () {
    if (this.dirty) { // 仅对计算属性而且是dirty（被污染的）有效
      this.value = this.get()
      this.dirty = false
    }
    return this.value
  }

  /**
   * Depend on this watcher. Only for computed property watchers.
   * 依靠这个观察者。仅适用于计算属性观察程序。
   */
  depend () {
    if (this.dep && Dep.target) {
      this.dep.depend() // 实际添加当前正在发生改变的dep
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   * 从所有的订阅器的订阅者总删除 当前watch（自身）
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      // 从vm的观察者列表中删除self这是一个有点昂贵的操作，因此如果vm正在被破坏，我们将跳过它。
      if (!this.vm._isBeingDestroyed) { // 正在被销毁（钩子可以看到）
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this) // 对每个deps都扫描一下当前的watch并删除（这样操作的确很昂贵）
      }
      this.active = false
    }
  }
}
