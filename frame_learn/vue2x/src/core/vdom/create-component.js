/* @flow */

import VNode from './vnode'
import { resolveConstructorOptions } from 'core/instance/init'
import { queueActivatedComponent } from 'core/observer/scheduler'
import { createFunctionalComponent } from './create-functional-component'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject
} from '../util/index'

import {
  resolveAsyncComponent,
  createAsyncPlaceholder,
  extractPropsFromVNodeData
} from './helpers/index'

import {
  callHook,
  activeInstance,
  updateChildComponent,
  activateChildComponent,
  deactivateChildComponent
} from '../instance/lifecycle'

import {
  isRecyclableComponent,
  renderRecyclableComponentTemplate
} from 'weex/runtime/recycle-list/render-component-template'

// inline hooks to be invoked on component VNodes during patch
// 在修补期间在组件Vnode上调用的内联挂钩
const componentVNodeHooks = {
  init (vnode: VNodeWithData, hydrating: boolean): ?boolean {
    if (
      // 是一个组件实例、而且没有被销毁、而且是一个keepAlive组件
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) {
      // 调用prepatch钩子
      // kept-alive components, treat as a patch
      const mountedNode: any = vnode // work around flow
      componentVNodeHooks.prepatch(mountedNode, mountedNode)
    } else {
      // 创建组件实例的vnode 然后主动 mount
      const child = vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance
      )
      child.$mount(hydrating ? vnode.elm : undefined, hydrating)
    }
  },

  prepatch (oldVnode: MountedComponentVNode, vnode: MountedComponentVNode) {
    const options = vnode.componentOptions
    const child = vnode.componentInstance = oldVnode.componentInstance
    /** 思考：是不是相同的节点会走这里 **/
    // 修改vnode的组件实例的child = oldVnode 的child 并且更新子组件
    updateChildComponent(
      child,
      options.propsData, // updated props
      options.listeners, // updated listeners
      vnode, // new parent vnode
      options.children // new children
    )
  },

  insert (vnode: MountedComponentVNode) {
    // 拿到vnode的 上下文和组件实例
    const { context, componentInstance } = vnode
    // 如果此组件没有挂载 ，先挂载，并调用挂载钩子
    if (!componentInstance._isMounted) {
      componentInstance._isMounted = true
      callHook(componentInstance, 'mounted')
    }
    // 如果是一个keepAlive组件
    if (vnode.data.keepAlive) {
      if (context._isMounted) {
        // vue-router#1212
        // During updates, a kept-alive component's child components may
        // change, so directly walking the tree here may call activated hooks
        // on incorrect children. Instead we push them into a queue which will
        // be processed after the whole patch process ended.
        // 在更新期间，保持活动状态的组件的子组件可能会发生更改，
        // 因此直接在此处浏览树可能会调用不正确的子组件上的激活挂钩。
        // 相反，我们将它们推入一个队列，在整个补丁过程结束后将对其进行处理。
        // 如果已经挂载，按照队列激活组件实例
        queueActivatedComponent(componentInstance)
      } else {
        // 直接激活子组件
        activateChildComponent(componentInstance, true /* direct */)
      }
    }
  },

  destroy (vnode: MountedComponentVNode) {
    const { componentInstance } = vnode
    if (!componentInstance._isDestroyed) {
      // 没有销毁 而且是不是一个keepAlive组件 调用销毁 否则直接停用子组件
      if (!vnode.data.keepAlive) {
        componentInstance.$destroy()
      } else {
        // 停用子组件
        deactivateChildComponent(componentInstance, true /* direct */)
      }
    }
  }
}

const hooksToMerge = Object.keys(componentVNodeHooks)

export function createComponent (
  Ctor: Class<Component> | Function | Object | void,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag?: string
): VNode | Array<VNode> | void {
  if (isUndef(Ctor)) {
    return
  }

  // 大Vue
  const baseCtor = context.$options._base

  // plain options object: turn it into a constructor
  // 纯选项对象：将其转换为构造函数
  if (isObject(Ctor)) {
    Ctor = baseCtor.extend(Ctor) // 调用大Vue的继承方法创建
  }

  // if at this stage it's not a constructor or an async component factory,
  // reject. // 如果在这个阶段它不是构造函数或异步组件工厂，请拒绝。
  if (typeof Ctor !== 'function') {
    if (process.env.NODE_ENV !== 'production') {
      warn(`Invalid Component definition: ${String(Ctor)}`, context)
    }
    return
  }

  // async component
  let asyncFactory
  // 如果cid不存在当异步组件处理 解析异步组件（因为异步组件还没有_init）
  if (isUndef(Ctor.cid)) {
    asyncFactory = Ctor
    Ctor = resolveAsyncComponent(asyncFactory, baseCtor, context)
    if (Ctor === undefined) {
      // return a placeholder node for async component, which is rendered
      // as a comment node but preserves all the raw information for the node.
      // the information will be used for async server-rendering and hydration.
      // 返回异步组件的占位符节点，该节点呈现为注释节点，但保留该节点的所有原始信息。
      // 这些信息将用于异步服务器呈现和hydration。
      return createAsyncPlaceholder( // 编译失败创建异步的占位符节点
        asyncFactory,
        data,
        context,
        children,
        tag
      )
    }
  }

  data = data || {}

  // resolve constructor options in case global mixins are applied after
  // component constructor creation
  // 在组件构造函数创建后应用全局混入的情况下解析构造函数选项
  resolveConstructorOptions(Ctor)

  // transform component v-model data into props & events
  // v-model 转换成 props和events
  if (isDef(data.model)) {
    transformModel(Ctor.options, data)
  }

  // extract props // 从Vnode数据中提取props
  const propsData = extractPropsFromVNodeData(data, Ctor, tag)

  // functional component // 创建功能组件
  if (isTrue(Ctor.options.functional)) {
    return createFunctionalComponent(Ctor, propsData, data, context, children)
  }

  // extract listeners, since these needs to be treated as
  // child component listeners instead of DOM listeners
  // 提取监听器，因为需要将这些监听器视为子组件监听器而不是DOM监听器
  const listeners = data.on
  // replace with listeners with .native modifier
  // so it gets processed during parent component patch.
  // 替换为具有.native修饰符的侦听器，以便在父组件修补期间对其进行处理。
  data.on = data.nativeOn

  // 抽象组件只保留props、listeners、slot
  if (isTrue(Ctor.options.abstract)) {
    // abstract components do not keep anything
    // other than props & listeners & slot

    // work around flow
    const slot = data.slot
    data = {}
    if (slot) {
      data.slot = slot
    }
  }

  // install component management hooks onto the placeholder node
  installComponentHooks(data) // 安装组件的钩子

  // return a placeholder vnode // 返回一个注释节点（这个vnode是一个注释节点么）
  const name = Ctor.options.name || tag
  const vnode = new VNode(
    `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`,
    data, undefined, undefined, undefined, context,
    { Ctor, propsData, listeners, tag, children },
    asyncFactory
  )

  // Weex specific: invoke recycle-list optimized @render function for
  // extracting cell-slot template.
  // https://github.com/Hanks10100/weex-native-directive/tree/master/component
  /* istanbul ignore if */
  // 用于提取单元槽模板
  if (__WEEX__ && isRecyclableComponent(vnode)) {
    return renderRecyclableComponentTemplate(vnode)
  }

  return vnode
}

export function createComponentInstanceForVnode (
  vnode: any, // we know it's MountedComponentVNode but flow doesn't
  parent: any, // activeInstance in lifecycle state
): Component {
  // 内部的组件选项
  const options: InternalComponentOptions = {
    _isComponent: true,
    _parentVnode: vnode, // 父级占位符节点
    parent
  }
  // check inline-template render functions
  // 检查是否含有内联组件 （含有则在opts中添加render和staticRenderFns）
  const inlineTemplate = vnode.data.inlineTemplate
  if (isDef(inlineTemplate)) {
    options.render = inlineTemplate.render
    options.staticRenderFns = inlineTemplate.staticRenderFns
  }
  // Ctor是什么？？（在继承中出现过）// 组件实例的时候调用的构造函数进行实例化组件
  return new vnode.componentOptions.Ctor(options)
}

/** 安装合并组件钩子和data里面的钩子 再放回data里面的钩子 **/
function installComponentHooks (data: VNodeData) {
  const hooks = data.hook || (data.hook = {})
  for (let i = 0; i < hooksToMerge.length; i++) {
    const key = hooksToMerge[i]
    const existing = hooks[key]
    const toMerge = componentVNodeHooks[key]
    if (existing !== toMerge && !(existing && existing._merged)) {
      hooks[key] = existing ? mergeHook(toMerge, existing) : toMerge
    }
  }
}

/** 合并前后的钩子 **/
function mergeHook (f1: any, f2: any): Function {
  const merged = (a, b) => {
    // flow 报错所以要使用any
    // flow complains about extra args which is why we use any
    f1(a, b)
    f2(a, b)
  }
  merged._merged = true
  return merged
}

// transform component v-model info (value and callback) into
// prop and event handler respectively.
// 将组件v-mode信息（值和回调）分别转换为prop和event handler。（v-model使用的）
function transformModel (options, data: any) {
  const prop = (options.model && options.model.prop) || 'value'
  const event = (options.model && options.model.event) || 'input'
  ;(data.props || (data.props = {}))[prop] = data.model.value
  const on = data.on || (data.on = {})
  if (isDef(on[event])) {
    on[event] = [data.model.callback].concat(on[event])
  } else {
    on[event] = data.model.callback
  }
}
