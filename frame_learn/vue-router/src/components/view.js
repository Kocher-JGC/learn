import { warn } from '../util/warn'
import { extend } from '../util/misc'

export default {
  name: 'RouterView',
  functional: true, // 函数化组件,如果是函数化组件的,render函数就会有第二个参数(context),拿到传参\children等数据
  props: {
    name: {
      type: String,
      default: 'default'
    }
  },
  // _ 是createElement // 第二个参数是context
  render (_, { props, children, parent, data }) {
    // used by devtools to display a router-view badge
    // 由devtools用于显示路由器视图徽章
    data.routerView = true

    // directly use parent context's createElement() function
    // so that components rendered by router-view can resolve named slots
    // 直接使用父上下文的createElement（）函数，以便路由器视图呈现的组件可以解析命名槽。
    const h = parent.$createElement
    const name = props.name
    const route = parent.$route
    const cache = parent._routerViewCache || (parent._routerViewCache = {})

    // determine current view depth, also check to see if the tree
    // has been toggled inactive but kept-alive.
    // 确定当前视图深度，同时检查树是否已被切换为非活动状态但仍保持活动状态。
    let depth = 0
    let inactive = false
    while (parent && parent._routerRoot !== parent) {
      if (parent.$vnode && parent.$vnode.data.routerView) {
        depth++ // 确定视图深度 根节点为第0级
      }
      if (parent._inactive) {
        inactive = true // 标记状态
      }
      parent = parent.$parent
    }
    data.routerViewDepth = depth

    // render previous view if the tree is inactive and kept-alive
    // 如果树处于非活动状态并保持活动状态，则渲染上一个视图
    if (inactive) {
      return h(cache[name], data, children)
    }

    const matched = route.matched[depth]
    // render empty node if no matched route
    // 如果没有匹配的路由，则呈现空节点
    if (!matched) {
      cache[name] = null
      return h()
    }

    // 匹配到的路由拿匹配到的component
    const component = cache[name] = matched.components[name]

    // attach instance registration hook
    // this will be called in the instance's injected lifecycle hooks
    // 附加实例注册挂钩这将在实例的注入生命周期挂钩中调用
    data.registerRouteInstance = (vm, val) => {
      // val could be undefined for unregistration // 无法注销未定义的value
      const current = matched.instances[name]
      if (
        (val && current !== vm) ||
        (!val && current === vm)
      ) {
        matched.instances[name] = val
      }
    }

    // also register instance in prepatch hook
    // in case the same component instance is reused across different routes
    // 如果相同的组件实例在不同的路由上重复使用，那么也在预处理挂钩中注册实例。 // (相同组件不同路由)
    ;(data.hook || (data.hook = {})).prepatch = (_, vnode) => {
      matched.instances[name] = vnode.componentInstance
    }

    // resolve props // 解析props
    let propsToPass = data.props = resolveProps(route, matched.props && matched.props[name])
    if (propsToPass) {
      // clone to prevent mutation // 克隆以防止突变
      propsToPass = data.props = extend({}, propsToPass)
      // pass non-declared props as attrs // 将未声明的props作为属性传递
      const attrs = data.attrs = data.attrs || {}
      for (const key in propsToPass) {
        if (!component.props || !(key in component.props)) {
          attrs[key] = propsToPass[key]
          delete propsToPass[key]
        }
      }
    }

    // 渲染匹配的组件
    return h(component, data, children)
  }
}

// 就是一个解析props的函数
function resolveProps (route, config) {
  switch (typeof config) {
    case 'undefined':
      return
    case 'object':
      return config
    case 'function':
      return config(route)
    case 'boolean':
      return config ? route.params : undefined
    default:
      if (process.env.NODE_ENV !== 'production') {
        warn(
          false,
          `props in "${route.path}" is a ${typeof config}, ` +
          `expecting an object, function or boolean.`
        )
      }
  }
}
