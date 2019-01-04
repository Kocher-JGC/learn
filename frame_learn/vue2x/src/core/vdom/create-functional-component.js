/* @flow */

import VNode, { cloneVNode } from './vnode'
import { createElement } from './create-element'
import { resolveInject } from '../instance/inject'
import { normalizeChildren } from '../vdom/helpers/normalize-children'
import { resolveSlots } from '../instance/render-helpers/resolve-slots'
import { installRenderHelpers } from '../instance/render-helpers/index'

import {
  isDef,
  isTrue,
  hasOwn,
  camelize,
  emptyObject,
  validateProp
} from '../util/index'

/** 函数渲染上下文 **/
export function FunctionalRenderContext (
  data: VNodeData,
  props: Object,
  children: ?Array<VNode>,
  parent: Component,
  Ctor: Class<Component>
) {
  const options = Ctor.options
  // ensure the createElement function in functional components
  // gets a unique context - this is necessary for correct named slot check
  // 确保函数组件中的createElement函数获得唯一的上下文-这对于正确的命名槽检查是必需的
  let contextVm
  if (hasOwn(parent, '_uid')) {
    contextVm = Object.create(parent)
    // $flow-disable-line
    contextVm._original = parent
  } else {
    // the context vm passed in is a functional context as well.
    // in this case we want to make sure we are able to get a hold to the
    // real context instance.
    // 传入的上下文VM也是一个函数上下文。在这种情况下，我们希望确保能够控制实际的上下文实例。
    contextVm = parent
    // $flow-disable-line
    parent = parent._original
  }
  const isCompiled = isTrue(options._compiled) // 是否已经编译
  const needNormalization = !isCompiled // 需要标准化（作用：）

  // 当前this指向 ？？
  /** 数据赋值 **/
  this.data = data
  this.props = props
  this.children = children
  this.parent = parent
  this.listeners = data.on || emptyObject // 绑定的事件
  this.injections = resolveInject(options.inject, parent) // 注入
  this.slots = () => resolveSlots(children, parent) // 组装插槽渲染函数

  // support for compiled functional template
  /** 支持编译后的函数模板 **/
  if (isCompiled) {
    // exposing $options for renderStatic() //暴露静态渲染函数
    this.$options = options
    // pre-resolve slots for renderSlot() // 预分析渲染插槽
    this.$slots = this.slots()
    this.$scopedSlots = data.scopedSlots || emptyObject // 作用域插槽
  }

  // 有作用域id，创建elm后要记录id和parent
  if (options._scopeId) {
    this._c = (a, b, c, d) => {
      const vnode = createElement(contextVm, a, b, c, d, needNormalization)
      if (vnode && !Array.isArray(vnode)) {
        vnode.fnScopeId = options._scopeId
        vnode.fnContext = parent
      }
      return vnode
    }
  } else {
    this._c = (a, b, c, d) => createElement(contextVm, a, b, c, d, needNormalization)
  }
}

// 初始化这个的渲染helper （FunctionalRenderContext） createFunctionalComponent 用到了
installRenderHelpers(FunctionalRenderContext.prototype)

/** 创建功能组件 **/
export function createFunctionalComponent (
  Ctor: Class<Component>,
  propsData: ?Object,
  data: VNodeData,
  contextVm: Component,
  children: ?Array<VNode>
): VNode | Array<VNode> | void {
  const options = Ctor.options
  const props = {}
  const propOptions = options.props
  // props 存在 校验 不 存在 mergeProps （含attrs和props）
  if (isDef(propOptions)) {
    for (const key in propOptions) {
      props[key] = validateProp(key, propOptions, propsData || emptyObject)
    }
  } else {
    if (isDef(data.attrs)) mergeProps(props, data.attrs)
    if (isDef(data.props)) mergeProps(props, data.props)
  }

  // 实例化渲染上下文（组装函数渲染上下文的实例）
  const renderContext = new FunctionalRenderContext(
    data,
    props,
    children,
    contextVm,
    Ctor
  )

  /** 编译/渲染 vnode **/
  const vnode = options.render.call(null, renderContext._c, renderContext)

  // 单个直接克隆 // 多个铺平vnode再克隆
  if (vnode instanceof VNode) {
    return cloneAndMarkFunctionalResult(vnode, data, renderContext.parent, options)
  } else if (Array.isArray(vnode)) {
    const vnodes = normalizeChildren(vnode) || []
    const res = new Array(vnodes.length) // 直接声明长度’有什么好处？
    for (let i = 0; i < vnodes.length; i++) {
      res[i] = cloneAndMarkFunctionalResult(vnodes[i], data, renderContext.parent, options)
    }
    return res
  }
}

// 设置fnContext和fnOpts 和保存插槽数据 返回克隆的节点
function cloneAndMarkFunctionalResult (vnode, data, contextVm, options) {
  // #7817 clone node before setting fnContext, otherwise if the node is reused
  // (e.g. it was from a cached normal slot) the fnContext causes named slots
  // that should not be matched to match.
  // 在设置fncontext之前克隆节点，否则如果节点被重用
  //（例如，它来自缓存的普通插槽）fncontext导致名为slotsb的不匹配。
  const clone = cloneVNode(vnode)
  clone.fnContext = contextVm
  clone.fnOptions = options
  if (data.slot) {
    (clone.data || (clone.data = {})).slot = data.slot
  }
  return clone
}

// 合并props
function mergeProps (to, from) {
  for (const key in from) {
    to[camelize(key)] = from[key]
  }
}
