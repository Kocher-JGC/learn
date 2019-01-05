/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import { mark, measure } from '../util/perf'
import { createEmptyVNode } from '../vdom/vnode'
import { updateComponentListeners } from './events'
import { resolveSlots } from './render-helpers/resolve-slots'
import { toggleObserving } from '../observer/index'
import { pushTarget, popTarget } from '../observer/dep'

import {
  warn,
  noop,
  remove,
  handleError,
  emptyObject,
  validateProp
} from '../util/index'

export let activeInstance: any = null
export let isUpdatingChildComponent: boolean = false

/** 初始化生命周期 **/
export function initLifecycle (vm: Component) {
  const options = vm.$options

  // locate first non-abstract parent
  // 定位第一个非抽象父级
  let parent = options.parent
  if (parent && !options.abstract) { // 有父而且不是抽象的
    // 迭代找到第一个不是抽象的父级
    while (parent.$options.abstract && parent.$parent) {
      parent = parent.$parent
    }
    parent.$children.push(vm) // 因为找到父级了，所以可以把子级push进去
  }

  vm.$parent = parent // 在上面找到父级，然后赋值
  vm.$root = parent ? parent.$root : vm

  // 定义子级数组和子组件应用的对象
  vm.$children = []
  vm.$refs = {}

  // 定义一些记录钩子状态的属性
  vm._watcher = null // 更新的观察者
  vm._inactive = null // 活跃状态
  vm._directInactive = false // 直接激活
  vm._isMounted = false // 是否安装
  vm._isDestroyed = false // 是否销毁
  vm._isBeingDestroyed = false // 正在被破坏
}

export function lifecycleMixin (Vue: Class<Component>) {
  Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) {
    const vm: Component = this // 记录this
    const prevEl = vm.$el // 记录当前元素为上一元素
    const prevVnode = vm._vnode // 记录当前vnode为上一vnode
    const prevActiveInstance = activeInstance // 记录上一活跃实例
    activeInstance = vm // 记录当前活跃实例
    vm._vnode = vnode // 传入的渲染render // 记录当前渲染的vnode
    // Vue.prototype.__patch__ is injected in entry points
    // based on the rendering backend used.
    // Vue.prototype.__patch__ 是根据所使用的渲染后端注入入口点的。
    if (!prevVnode) { // 是否首次渲染
      // initial render // 首次渲染有真实的的DOM
      vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */)
    } else {
      // updates
      vm.$el = vm.__patch__(prevVnode, vnode)
    }
    /** （为何这样） **/
    // 值从vm改变成上一活跃实例prevActiveInstance
    activeInstance = prevActiveInstance
    // update __vue__ reference
    /** 作出一下2个改变有何意义？？ **/
    if (prevEl) {
      prevEl.__vue__ = null
    }
    if (vm.$el) {
      vm.$el.__vue__ = vm
    }
    // 如果父级是临时的，也要更新它的$el
    // if parent is an HOC, update its $el as well
    /**
     * vm.$vnode = opts._parentVnode (compiler)
     * vm.$parent (第一个非抽象父级)._vnode最后渲染的render
     * vm.$vnode === vm.$parent._vnode 为什么可以证明是临时的
     * **/
    if (vm.$vnode && vm.$parent && vm.$vnode === vm.$parent._vnode) {
      vm.$parent.$el = vm.$el
    }
    // 调用程序调用更新的钩子，以确保在父级的更新钩子中更新子级。
    // updated hook is called by the scheduler to ensure that children are
    // updated in a parent's updated hook.
  }

  /** 重新渲染本身、插槽和子组件 （主动调用_watcher.update()） **/
  Vue.prototype.$forceUpdate = function () {
    const vm: Component = this
    if (vm._watcher) {
      vm._watcher.update()
    }
  }

  /** 静态的全局的销毁方法 **/
  Vue.prototype.$destroy = function () {
    const vm: Component = this
    // 是否正在销毁
    if (vm._isBeingDestroyed) {
      return
    }
    callHook(vm, 'beforeDestroy') // 销毁前的钩子
    vm._isBeingDestroyed = true
    // remove self from parent  从父级移除自身
    const parent = vm.$parent
    // 有父级、且父级不是正在销毁、且当前vm不是抽象vm
    if (parent && !parent._isBeingDestroyed && !vm.$options.abstract) {
      remove(parent.$children, vm)
    }
    // teardown watchers // 解除观察者对象
    if (vm._watcher) {
      vm._watcher.teardown()
    }
    // 如果是数组循环解除
    let i = vm._watchers.length
    while (i--) {
      vm._watchers[i].teardown()
    }
    // remove reference from data ob
    // frozen object may not have observer.
    // 从数据对象中删除引用冻结对象可能没有观察者。
    if (vm._data.__ob__) {
      vm._data.__ob__.vmCount--
    }
    // call the last hook... //最后的钩子
    vm._isDestroyed = true
    // invoke destroy hooks on current rendered tree
    // 在当前呈现的树上调用销毁挂钩 （调用patch删除dom）
    vm.__patch__(vm._vnode, null)
    // fire destroyed hook 销毁完成的钩子
    callHook(vm, 'destroyed')
    // turn off all instance listeners.
    // 销毁完成后取消所有实例的事件监听
    vm.$off()
    // 移除 __vue__ 和 $vnode.parent 的引用
    // remove __vue__ reference
    if (vm.$el) {
      vm.$el.__vue__ = null
    }
    // release circular reference (#6759)
    if (vm.$vnode) {
      vm.$vnode.parent = null
    }
  }
}

/** $mount 方法的实际调用 **/
export function mountComponent (
  vm: Component,
  el: ?Element,
  hydrating?: boolean
): Component {
  vm.$el = el
  if (!vm.$options.render) {
    vm.$options.render = createEmptyVNode
    if (process.env.NODE_ENV !== 'production') {
      /* istanbul ignore if */
      if ((vm.$options.template && vm.$options.template.charAt(0) !== '#') ||
        vm.$options.el || el) {
        warn(
          'You are using the runtime-only build of Vue where the template ' +
          'compiler is not available. Either pre-compile the templates into ' +
          'render functions, or use the compiler-included build.',
          vm
        )
      } else {
        warn(
          'Failed to mount component: template or render function not defined.',
          vm
        )
      }
    }
  }
  // 挂载前的钩子
  callHook(vm, 'beforeMount')

  let updateComponent
  /* istanbul ignore if */
  if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
    updateComponent = () => {
      const name = vm._name
      const id = vm._uid
      const startTag = `vue-perf-start:${id}`
      const endTag = `vue-perf-end:${id}`

      mark(startTag)
      const vnode = vm._render()
      mark(endTag)
      measure(`vue ${name} render`, startTag, endTag)

      mark(startTag)
      vm._update(vnode, hydrating)
      mark(endTag)
      measure(`vue ${name} patch`, startTag, endTag)
    }
  } else {
    updateComponent = () => {
      vm._update(vm._render(), hydrating)
    }
  }

  // we set this to vm._watcher inside the watcher's constructor
  // since the watcher's initial patch may call $forceUpdate (e.g. inside child
  // component's mounted hook), which relies on vm._watcher being already defined
  // 我们将其设置为vm._watcher，因为watcher的初始补丁可能会调用$forceupdate
  // （例如，在子组件的挂载钩子中），这依赖于vm._watcher已经被定义。
  new Watcher(vm, updateComponent, noop, {
    before () {
      if (vm._isMounted) {
        callHook(vm, 'beforeUpdate')
      }
    }
  }, true /* isRenderWatcher */)
  hydrating = false

  // manually mounted inst ance, call mounted on self
  // mounted is called for render-created child components in its inserted hook
  // 对于在其插入的钩子中呈现创建的子组件，调用mounted on self mounted来调用手动安装的inst ance。
  if (vm.$vnode == null) {
    // 在初始化的时候 $vnode为null但是一旦调用_rener后$vnode将变成_parentVnode
    // 并且记录实例渲染状态 调用钩子
    vm._isMounted = true
    callHook(vm, 'mounted')
  }
  return vm
}

export function updateChildComponent (
  vm: Component,
  propsData: ?Object,
  listeners: ?Object,
  parentVnode: MountedComponentVNode,
  renderChildren: ?Array<VNode>
) {
  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = true
  }

  // determine whether component has slot children
  // we need to do this before overwriting $options._renderChildren
  // 确定组件是否有槽子项，我们需要在覆盖$options之前执行此操作。
  const hasChildren = !!( // 只要含有就是有children （更新作用域插槽）
    renderChildren ||               // has new static slots 新的静态插槽
    vm.$options._renderChildren ||  // has old static slots 旧的静态插槽
    parentVnode.data.scopedSlots || // has new scoped slots 新的作用域插槽
    vm.$scopedSlots !== emptyObject // has old scoped slots 旧的作用域插槽
  )

  /** 先主动更新 不更新的数据
   *  再更新 props 、 listeners 、 slots + force
  **/

  // 这是父级占位符节点和父级
  vm.$options._parentVnode = parentVnode
  // update vm's placeholder node without re-render
  // 在不重新呈现的情况下更新VM的占位符节点
  vm.$vnode = parentVnode

  if (vm._vnode) { // update child tree's parent // 更新子的父级
    vm._vnode.parent = parentVnode
  }
  vm.$options._renderChildren = renderChildren // 渲染children

  // update $attrs and $listeners hash
  // these are also reactive so they may trigger child update if the child
  // used them during render
  // 更新$attrs和$listeners散列这些也是被动的，因此如果子级在呈现期间使用它们，
  // 它们可能会触发子级更新。
  vm.$attrs = parentVnode.data.attrs || emptyObject
  vm.$listeners = listeners || emptyObject

  // update props // 关闭更新 主动更新porps数组 打开更新
  if (propsData && vm.$options.props) {
    toggleObserving(false)
    const props = vm._props
    const propKeys = vm.$options._propKeys || []
    for (let i = 0; i < propKeys.length; i++) {
      const key = propKeys[i]
      const propOptions: any = vm.$options.props // wtf flow?
      props[key] = validateProp(key, propOptions, propsData, vm)
    }
    toggleObserving(true)
    // keep a copy of raw propsData // 保持引用关系
    vm.$options.propsData = propsData
  }

  // update listeners
  listeners = listeners || emptyObject
  const oldListeners = vm.$options._parentListeners
  // 先更新_parentListeners 再调用 updateComponentListeners 更新 ？？ 为何如此
  vm.$options._parentListeners = listeners
  updateComponentListeners(vm, listeners, oldListeners)

  // resolve slots + force update if has children
  if (hasChildren) {
    // 重新解析插槽 然后强制更新 （为什么要做强制更新）
    vm.$slots = resolveSlots(renderChildren, parentVnode.context)
    vm.$forceUpdate()
  }

  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = false
  }
}

// 向上寻找，找到活跃组件找到true，找不到fals
function isInInactiveTree (vm) {
  while (vm && (vm = vm.$parent)) {
    if (vm._inactive) return true
  }
  return false
}

export function activateChildComponent (vm: Component, direct?: boolean) {
  // 直接激活或者在激活状态
  if (direct) {
    vm._directInactive = false
    if (isInInactiveTree(vm)) {
      return
    }
  } else if (vm._directInactive) {
    return
  }
  // 递归查找 （先递归再调用activated钩子的）
  if (vm._inactive || vm._inactive === null) {
    vm._inactive = false // 激活状态标记为false（动态组件的）
    for (let i = 0; i < vm.$children.length; i++) {
      activateChildComponent(vm.$children[i])
    }
    callHook(vm, 'activated')
  }
}

export function deactivateChildComponent (vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = true
    if (isInInactiveTree(vm)) {
      return
    }
  }
  if (!vm._inactive) {
    vm._inactive = true
    for (let i = 0; i < vm.$children.length; i++) {
      deactivateChildComponent(vm.$children[i])
    }
    callHook(vm, 'deactivated')
  }
}

export function callHook (vm: Component, hook: string) {
  // #7573 disable dep collection when invoking lifecycle hooks
  // 关闭dep收集当执行生命周期钩子的时候
  pushTarget()
  const handlers = vm.$options[hook]
  if (handlers) {
    for (let i = 0, j = handlers.length; i < j; i++) {
      try {
        handlers[i].call(vm)
      } catch (e) {
        handleError(e, vm, `${hook} hook`)
      }
    }
  }
  if (vm._hasHookEvent) {
    vm.$emit('hook:' + hook)
  }
  popTarget()
}
