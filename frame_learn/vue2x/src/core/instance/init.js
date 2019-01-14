/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

export function initMixin (Vue: Class<Component>) {
  Vue.prototype._init = function (options?: Object) {
    const vm: Component = this
    // a uid // 每个初始化的唯一标识
    vm._uid = uid++

    let startTag, endTag
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // a flag to avoid this being observed
    vm._isVue = true
    // merge options 分组件或者实例化的时候进行合并配置
    if (options && options._isComponent) {
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      initInternalComponent(vm, options)
    } else {
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      )
    }
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      // 非生产和生产的代理有何用
      initProxy(vm) // vm 或者 new Proxy(vm, handlers)
    } else {
      vm._renderProxy = vm
    }
    // expose real self
    vm._self = vm
    initLifecycle(vm) // 初始化生命周期钩子
    initEvents(vm) // 初始化事件中心 // 初始化事件中心实际复制父组件事件
    initRender(vm) // 初始化渲染
    callHook(vm, 'beforeCreate')
    // 2.2.0+ 新增 初始化注入（注入父组件的数据到自身）
    initInjections(vm) // resolve injections before data/props
    // 初始化 data、props、computed、watcher 等等。
    initState(vm)
    // 2.2.0+ 新增 初始化供应商（为子组件提供不响应的数据）
    initProvide(vm) // resolve provide after data/props
    callHook(vm, 'created')

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    if (vm.$options.el) {
      // 检测到如果有 el 属性，则调⽤ vm.$mount ⽅法挂载 vm ，
      // 挂载的⽬标就是把模板渲染成最终的 DOM
      vm.$mount(vm.$options.el)
    }
  }
}

/** 通过mergeOpts改变元素的父级，父级vnode，
 *  data，listeners，children，tag，
 *  render、staticRenderFns等
**/
// 初始化内部组件
export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  // 这样做是因为它比动态枚举更快。
  const parentVnode = options._parentVnode // 父占位符节点
  opts.parent = options.parent // 枚举更快？
  opts._parentVnode = parentVnode

  // 父占位符节点的compOpts
  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

/** 解析构造函数的opts **/
export function resolveConstructorOptions (Ctor: Class<Component>) {
  let options = Ctor.options
  if (Ctor.super) {
    // 有父级递归先解析父级的
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) { // 不相等 就是已经更改了父级opts
      // super option changed,
      // need to resolve new options.
      // 父级选项已更改，需要解析新选项。
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      // 检查是否有任何后期修改/附加选项
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options 有附加就更新选项
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      /** 合并继承opts ==> 父级opts **/
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      /** 理解：修改组件的构造函数？ **/
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  const extended = Ctor.extendOptions
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      /** 不一定会进来 这样写是优化还是徒增判断逻辑呢？ 当然如果都没进来那就是undefined**/
      if (!modified) modified = {}
      modified[key] = dedupe(latest[key], extended[key], sealed[key])
    }
  }
  return modified
}

/** 确保在合并之间不重复生命周期挂钩 **/
function dedupe (latest, extended, sealed) {
  // compare latest and sealed to ensure lifecycle hooks won't be duplicated
  // between merges
  // 比较最新的和确定（密封、未知）的，以确保在合并之间不重复生命周期挂钩
  if (Array.isArray(latest)) {
    const res = []
    sealed = Array.isArray(sealed) ? sealed : [sealed]
    extended = Array.isArray(extended) ? extended : [extended]
    for (let i = 0; i < latest.length; i++) {
      // push original options and not sealed options to exclude duplicated options
      // 推送原始选项和非密封选项以排除重复的选项
      if (extended.indexOf(latest[i]) >= 0 || sealed.indexOf(latest[i]) < 0) {
        res.push(latest[i])
      }
    }
    return res
  } else {
    return latest
  }
}
