/* @flow */

import {
  warn,
  nextTick,
  emptyObject,
  handleError,
  defineReactive
} from '../util/index'

import { createElement } from '../vdom/create-element'
import { installRenderHelpers } from './render-helpers/index'
import { resolveSlots } from './render-helpers/resolve-slots'
import VNode, { createEmptyVNode } from '../vdom/vnode'

import { isUpdatingChildComponent } from './lifecycle'

export function initRender (vm: Component) {
  // 定义vnode变量和静态树（用于v-once缓存）
  vm._vnode = null // the root of the child tree
  vm._staticTrees = null // v-once cached trees
  const options = vm.$options
  // the placeholder node in parent tree // 父树中的占位符节点
  const parentVnode = vm.$vnode = options._parentVnode
  const renderContext = parentVnode && parentVnode.context // 渲染上下文
  /** 解析插槽 ==> 内部 **/
  vm.$slots = resolveSlots(options._renderChildren, renderContext)
  vm.$scopedSlots = emptyObject // 作用域插槽
  // bind the createElement fn to this instance
  // so that we get proper render context inside it.
  // args order: tag, data, children, normalizationType, alwaysNormalize
  // internal version is used by render functions compiled from templates
  // 将createElement fn绑定到此实例，以便在其中获得适当的渲染上下文。
  // args order:标记、数据、子级、规范化类型、alwaysnormalize内部版本由从模板编译的呈现函数使用
  // 内部创建元素的函数
  vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false)
  // normalization is always applied for the public version, used in
  // user-written render functions.
  // 外部 // 规范化始终应用于公共版本，在用户编写的呈现函数中使用。
  vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true)

  // $attrs & $listeners are exposed for easier HOC creation.
  // they need to be reactive so that HOCs using them are always updated
  // 拿到父节点的属性定义
  const parentData = parentVnode && parentVnode.data

  /* istanbul ignore else */
  // 监听$attrs和$listeners
  if (process.env.NODE_ENV !== 'production') {
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$attrs is readonly.`, vm)
    }, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$listeners is readonly.`, vm)
    }, true)
  } else {
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, null, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, null, true)
  }
}

export function renderMixin (Vue: Class<Component>) {
  // install runtime convenience helpers
  // 安装各种渲染的工具
  installRenderHelpers(Vue.prototype)

  Vue.prototype.$nextTick = function (fn: Function) {
    return nextTick(fn, this)
  }

  Vue.prototype._render = function (): VNode {
    const vm: Component = this
    // 拿到compiler生成的render和staticRender以及拿到init时候存储的父级vnode
    const { render, _parentVnode } = vm.$options

    // reset _rendered flag on slots for duplicate slot check
    // 为重复插槽检查重置插槽上呈现的标志
    if (process.env.NODE_ENV !== 'production') {
      for (const key in vm.$slots) {
        // $flow-disable-line // 开发环境记录渲染状态
        vm.$slots[key]._rendered = false
      }
    }

    /**
     *  如果父级占位符节点存在
     * 问题：定义的作用域插槽有什么用 ？
    **/
    if (_parentVnode) {
      vm.$scopedSlots = _parentVnode.data.scopedSlots || emptyObject
    }

    // set parent vnode. this allows render functions to have access
    // to the data on the placeholder node.
    // 设置父Vnode。这允许渲染函数访问占位符节点上的数据。
    vm.$vnode = _parentVnode
    // render self // 渲染和返回
    let vnode
    try {
      //  调用render渲染，传入渲染代理和 init的时候组装的createElement
      vnode = render.call(vm._renderProxy, vm.$createElement)
    } catch (e) {
      handleError(e, vm, `render`) // 错误处理工具
      // return error render result,
      // or previous vnode to prevent render error causing blank component
      /* istanbul ignore else */
      // 区别环境进行错误渲染，或者储存vnode=父级vnode
      if (process.env.NODE_ENV !== 'production') {
        if (vm.$options.renderError) {
          try {
            vnode = vm.$options.renderError.call(vm._renderProxy, vm.$createElement, e)
          } catch (e) {
            handleError(e, vm, `renderError`)
            vnode = vm._vnode
          }
        } else {
          vnode = vm._vnode
        }
      } else {
        vnode = vm._vnode
      }
    }
    // return empty vnode in case the render function errored out
    if (!(vnode instanceof VNode)) {
      if (process.env.NODE_ENV !== 'production' && Array.isArray(vnode)) {
        warn(
          'Multiple root nodes returned from render function. Render function ' +
          'should return a single root node.',
          vm
        )
      }
      vnode = createEmptyVNode()
    }
    // set parent // 储存vnode和设置parent
    vnode.parent = _parentVnode
    return vnode
  }
}
