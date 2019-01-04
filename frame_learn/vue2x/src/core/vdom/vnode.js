/* @flow */

// VirtualDOM 实例的class
export default class VNode {
  tag: string | void; // 标签
  data: VNodeData | void; // 数据
  children: ?Array<VNode>; // 子
  text: string | void; // 文本节点
  elm: Node | void; // 真实的DOM
  ns: string | void; // math和svg的命名空间
  // 渲染在当前组件作用域 ？？
  context: Component | void; // rendered in this component's scope
  key: string | number | void; // 用处？
  componentOptions: VNodeComponentOptions | void; // 组件的选项
  componentInstance: Component | void; // component instance 组件实例
  parent: VNode | void; // component placeholder node 组件的占位符节点 ？（为什么不是父亲）

  // strictly internal 内部的
  raw: boolean; // contains raw HTML? (server only) 服务端渲染，是否为html容器
  isStatic: boolean; // hoisted static node 静态节点
  // 输入转换检查所必需的 是否根插入   （应该和过渡有关系）
  isRootInsert: boolean; // necessary for enter transition check
  isComment: boolean; // empty comment placeholder? // 空注释占位符 （是否注释节点）
  isCloned: boolean; // is a cloned node? // 是否克隆节点调用cloneVNode时候为true
  isOnce: boolean; // is a v-once node? // 是否只渲染一次
  // 异步组件的构造函数
  asyncFactory: Function | void; // async component factory function
  asyncMeta: Object | void;
  isAsyncPlaceholder: boolean; // 异步占位符
  ssrContext: Object | void;
  // 功能节点的虚拟上下文
  fnContext: Component | void; // real context vm for functional nodes
  fnOptions: ?ComponentOptions; // for SSR caching
  fnScopeId: ?string; // functional scope id support

  constructor (
    tag?: string,
    data?: VNodeData,
    children?: ?Array<VNode>,
    text?: string,
    elm?: Node,
    context?: Component,
    componentOptions?: VNodeComponentOptions,
    asyncFactory?: Function
  ) {
    this.tag = tag
    this.data = data
    this.children = children
    this.text = text
    this.elm = elm
    this.ns = undefined
    this.context = context
    this.fnContext = undefined
    this.fnOptions = undefined
    this.fnScopeId = undefined
    this.key = data && data.key
    this.componentOptions = componentOptions
    this.componentInstance = undefined
    this.parent = undefined
    this.raw = falsediaoy
    this.isStatic = false
    this.isRootInsert = true
    this.isComment = false
    this.isCloned = false
    this.isOnce = false
    this.asyncFactory = asyncFactory
    this.asyncMeta = undefined
    this.isAsyncPlaceholder = false
  }

  // DEPRECATED: alias for componentInstance for backwards compat. // 不赞成的：组件实例的别名，用于向后兼容
  /* istanbul ignore next */
  get child (): Component | void {
    return this.componentInstance
  }
}

// 空的注释节点
export const createEmptyVNode = (text: string = '') => {
  const node = new VNode()
  node.text = text
  node.isComment = true
  return node
}

// 文本节点
export function createTextVNode (val: string | number) {
  return new VNode(undefined, undefined, undefined, String(val))
}

// optimized shallow clone
// used for static nodes and slot nodes because they may be reused across
// multiple renders, cloning them avoids errors when DOM manipulations rely
// on their elm reference.
/** 优化的浅克隆用于静态节点和槽节点，
 * 因为它们可以跨多个渲染重用，
 * 克隆它们可以避免在DOM操作依赖于ELM引用时出错。**/
export function cloneVNode (vnode: VNode): VNode {
  const cloned = new VNode(
    vnode.tag,
    vnode.data,
    vnode.children,
    vnode.text,
    vnode.elm,
    vnode.context,
    vnode.componentOptions,
    vnode.asyncFactory
  )
  cloned.ns = vnode.ns
  cloned.isStatic = vnode.isStatic
  cloned.key = vnode.key
  cloned.isComment = vnode.isComment
  cloned.fnContext = vnode.fnContext
  cloned.fnOptions = vnode.fnOptions
  cloned.fnScopeId = vnode.fnScopeId
  cloned.asyncMeta = vnode.asyncMeta
  cloned.isCloned = true
  return cloned
}
