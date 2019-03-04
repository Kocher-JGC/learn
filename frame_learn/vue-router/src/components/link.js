/* @flow */

import { createRoute, isSameRoute, isIncludedRoute } from '../util/route'
import { extend } from '../util/misc'

// work around weird flow bug
const toTypes: Array<Function> = [String, Object]
const eventTypes: Array<Function> = [String, Array]

export default {
  name: 'RouterLink',
  // 该组件接收的传参
  // [props\tag\event]
  // [exact\append\replace] : Boolean
  // [activeClass\exactActiveClass] :string
  props: {
    to: {
      type: toTypes,
      required: true
    },
    tag: {
      type: String,
      default: 'a'
    },
    exact: Boolean, // 严格模式的路由
    append: Boolean,
    replace: Boolean,
    activeClass: String,
    exactActiveClass: String,
    event: {
      type: eventTypes,
      default: 'click'
    }
  },
  render (h: Function) {
    // 拿到储存的2个route对象
    const router = this.$router
    const current = this.$route
    // 解析路由返回结果 
    const { location, route, href } = router.resolve(this.to, current, this.append)

    const classes = {}
    // 拿到特定的class
    const globalActiveClass = router.options.linkActiveClass
    const globalExactActiveClass = router.options.linkExactActiveClass
    // Support global empty active class // 支持全局空活动类
    const activeClassFallback = globalActiveClass == null
      ? 'router-link-active'
      : globalActiveClass
    const exactActiveClassFallback = globalExactActiveClass == null
      ? 'router-link-exact-active'
      : globalExactActiveClass
    const activeClass = this.activeClass == null
      ? activeClassFallback
      : this.activeClass
    const exactActiveClass = this.exactActiveClass == null
      ? exactActiveClassFallback
      : this.exactActiveClass
    // 上面是对class的处理

    // 拿到route对象
    const compareTarget = location.path
      ? createRoute(null, location, null, router)
      : route

    // classes 
    classes[exactActiveClass] = isSameRoute(current, compareTarget)
    classes[activeClass] = this.exact
      ? classes[exactActiveClass]
      : isIncludedRoute(current, compareTarget)

    // 组装router处理的函数
    const handler = e => {
      if (guardEvent(e)) {
        if (this.replace) {
          router.replace(location)
        } else {
          router.push(location)
        }
      }
    }

    // 单次或者多次赋值(执行)
    const on = { click: guardEvent }
    if (Array.isArray(this.event)) {
      this.event.forEach(e => { on[e] = handler })
    } else {
      on[this.event] = handler
    }

    // 赋值生成的class
    const data: any = {
      class: classes
    }

    // 绑定事件和跳转的地址
    if (this.tag === 'a') {
      data.on = on
      data.attrs = { href }
    } else {
      // find the first <a> child and apply listener and href
      // 找到第一个子级a并添加listener和href
      const a = findAnchor(this.$slots.default)
      if (a) {
        // in case the <a> is a static node
        // 如果<a>是静态节点
        a.isStatic = false
        const aData = a.data = extend({}, a.data)
        aData.on = on
        const aAttrs = a.data.attrs = extend({}, a.data.attrs)
        aAttrs.href = href
      } else {
        // doesn't have <a> child, apply listener to self
        // 没有孩子，把听者应用到自己身上
        data.on = on
      }
    }

    // 对跳转处理好之后 -->　调用createElement生成对应的vnode
    return h(this.tag, data, this.$slots.default)
  }
}

// 守卫事件 
function guardEvent (e) {
  // don't redirect with control keys // 使用控制键打开“不重定向”
  if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return
  // don't redirect when preventDefault called // 调用PreventDefault时不重定向
  if (e.defaultPrevented) return
  // don't redirect on right click // 右键单击时不重定向
  if (e.button !== undefined && e.button !== 0) return
  // don't redirect if `target="_blank"` // 如果'target=“_blank”，则不重定向`
  if (e.currentTarget && e.currentTarget.getAttribute) {
    const target = e.currentTarget.getAttribute('target')
    if (/\b_blank\b/i.test(target)) return
  }
  // this may be a Weex event which doesn't have this method
  // 这可能是一个没有此方法的weex事件
  if (e.preventDefault) {
    e.preventDefault()
  }
  return true
}

// 循环递归找a
function findAnchor (children) {
  if (children) {
    let child
    // 迭代\递归children,找到a为止
    for (let i = 0; i < children.length; i++) {
      child = children[i]
      if (child.tag === 'a') {
        return child
      }
      if (child.children && (child = findAnchor(child.children))) {
        return child
      }
    }
  }
}
