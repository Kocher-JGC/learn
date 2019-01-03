/* @flow */

import config from '../config'
import VNode, { createEmptyVNode } from './vnode'
import { createComponent } from './create-component'
import { traverse } from '../observer/traverse'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject,
  isPrimitive,
  resolveAsset
} from '../util/index'

import {
  normalizeChildren,
  simpleNormalizeChildren
} from './helpers/index'

const SIMPLE_NORMALIZE = 1
const ALWAYS_NORMALIZE = 2

// 包装函数，用于提供更灵活的接口
// wrapper function for providing a more flexible interface
// without getting yelled at by flow // 翻译不出来
export function createElement (
  context: Component, // 上下文组件
  tag: any, // 标签
  data: any, // 数据
  children: any, // 子
  normalizationType: any, // 标准化啥？
  alwaysNormalize: boolean // 总是标准的（不用再编译的）
): VNode | Array<VNode> {
  // 如果是一个数组或者是基本类型，无data
  if (Array.isArray(data) || isPrimitive(data)) {
    normalizationType = children
    children = data
    data = undefined
  }
  if (isTrue(alwaysNormalize)) {
    // 总是标准的normalizationType = 2 在 $createElement 下为true
    normalizationType = ALWAYS_NORMALIZE
  }
  return _createElement(context, tag, data, children, normalizationType)
}

export function _createElement (
  context: Component,
  tag?: string | Class<Component> | Function | Object,
  data?: VNodeData,
  children?: any,
  normalizationType?: number
): VNode | Array<VNode> {
  // __ob__ 是否为响应式数据，为什么如果存在就报错 然后返回空vnode
  // data type == any
  if (isDef(data) && isDef((data).__ob__)) {
    process.env.NODE_ENV !== 'production' && warn(
      `Avoid using observed data object as vnode data: ${JSON.stringify(data)}\n` +
      'Always create fresh vnode data objects in each render!',
      context
    )
    return createEmptyVNode()
  }
  // object syntax in v-bind
  /** 异步v-bind处理，is在哪里赋值？ **/
  if (isDef(data) && isDef(data.is)) {
    tag = data.is
  }
  // 无tag设置空节点
  if (!tag) {
    // 在组件的情况下:设置为falsy值
    // in case of component :is set to falsy value
    return createEmptyVNode()
  }
  // warn against non-primitive key
  // 警告不要使用非基本键 （非法键如obj对象）
  if (process.env.NODE_ENV !== 'production' &&
    isDef(data) && isDef(data.key) && !isPrimitive(data.key)
  ) {
    if (!__WEEX__ || !('@binding' in data.key)) {
      warn(
        'Avoid using non-primitive value as key, ' +
        'use string/number value instead.',
        context
      )
    }
  }
  // support single function children as default scoped slot
  // 支持单函数子函数作为默认作用域插槽
  if (Array.isArray(children) &&
    typeof children[0] === 'function'
  ) {
    /** 此处修改作用域的默认有何用 ，其他children又如何处理？**/
    data = data || {}
    data.scopedSlots = { default: children[0] }
    children.length = 0
  }
  // 总是规范化，递归铺平children树
  if (normalizationType === ALWAYS_NORMALIZE) {
    children = normalizeChildren(children)
  // 简单规范化就铺平一级
  } else if (normalizationType === SIMPLE_NORMALIZE) {
    children = simpleNormalizeChildren(children)
  }
  let vnode, ns
  if (typeof tag === 'string') {
    let Ctor
    // opts._parentvnode && ns存在 否则获取tagNamespace
    /** 命名空间有什么用？？ **/
    ns = (context.$vnode && context.$vnode.ns) || config.getTagNamespace(tag)
    // 是否html保留标签
    if (config.isReservedTag(tag)) {
      // platform built-in elements // 平台内置元素
      vnode = new VNode(
        config.parsePlatformTagName(tag), data, children,
        undefined, undefined, context
      )
      // 如果是为已注册的组件名创建一个组件类型的vnode
    } else if (isDef(Ctor = resolveAsset(context.$options, 'components', tag))) {
      // component
      vnode = createComponent(Ctor, data, context, children, tag)
    } else {
      // unknown or unlisted namespaced elements
      // check at runtime because it may get assigned a namespace when its
      // parent normalizes children
      // 运行时检查未知或未列出的命名空间元素，因为当其父级规范化子级时，可能会为其分配命名空间。
      vnode = new VNode(
        tag, data, children,
        undefined, undefined, context
      )
    }
  } else {
    // 直接组件选项/构造函数 // component类型直接调用createComponent创建
    // direct component options / constructor
    vnode = createComponent(tag, data, context, children)
  }
  // 根据不同类型返回vnode （有何用？array和普通）
  if (Array.isArray(vnode)) {
    return vnode
  } else if (isDef(vnode)) {
    if (isDef(ns)) applyNS(vnode, ns)
    if (isDef(data)) registerDeepBindings(data) // resolve issues
    return vnode
  } else {
    return createEmptyVNode()
  }
}

function applyNS (vnode, ns, force) {
  vnode.ns = ns
  // 不相干的标签对象
  if (vnode.tag === 'foreignObject') {
    // 默认使用内部不相干对象的命名标签
    // use default namespace inside foreignObject
    ns = undefined
    force = true
  }
  // 递归调用添加NameSpace
  if (isDef(vnode.children)) {
    for (let i = 0, l = vnode.children.length; i < l; i++) {
      const child = vnode.children[i]
      if (isDef(child.tag) && (
        isUndef(child.ns) || (isTrue(force) && child.tag !== 'svg'))) {
        applyNS(child, ns, force)
      }
    }
  }
}

// ref #5318
// necessary to ensure parent re-render when deep bindings like :style and
// :class are used on slot nodes
// 当在槽节点上使用诸如：style和：class之类的深度绑定时，必须确保父级重新呈现
function registerDeepBindings (data) {
  if (isObject(data.style)) {
    traverse(data.style)
  }
  if (isObject(data.class)) {
    traverse(data.class)
  }
}
