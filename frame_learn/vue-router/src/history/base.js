/* @flow */

import { _Vue } from '../install'
import type Router from '../index'
import { inBrowser } from '../util/dom'
import { runQueue } from '../util/async'
import { warn, isError } from '../util/warn'
import { START, isSameRoute } from '../util/route'
import {
  flatten,
  flatMapComponents,
  resolveAsyncComponents
} from '../util/resolve-components'

export class History {
  router: Router;
  base: string;
  current: Route;
  pending: ?Route;
  cb: (r: Route) => void;
  ready: boolean;
  readyCbs: Array<Function>;
  readyErrorCbs: Array<Function>;
  errorCbs: Array<Function>;

  // implemented by sub-classes
  +go: (n: number) => void;
  +push: (loc: RawLocation) => void;
  +replace: (loc: RawLocation) => void;
  +ensureURL: (push?: boolean) => void;
  +getCurrentLocation: () => string;

  constructor (router: Router, base: ?string) {
    this.router = router // 当前router对象
    this.base = normalizeBase(base) // 拿到文档的基础路径
    // start with a route object that stands for "nowhere"
    // 从一个表示“无处可去”的route对象开始
    this.current = START
    this.pending = null // 等待状态
    this.ready = false // 加载状态
    this.readyCbs = []
    this.readyErrorCbs = []
    this.errorCbs = []
  }

  listen (cb: Function) {
    this.cb = cb // 改变cbs进行监听事件
  }

  /* 如果是ready状态直接调用,否则向ready的cbs进行操作 **/
  onReady (cb: Function, errorCb: ?Function) {
    if (this.ready) {
      cb()
    } else {
      this.readyCbs.push(cb)
      if (errorCb) {
        this.readyErrorCbs.push(errorCb)
      }
    }
  }

  // 向errorCbs添加事件
  onError (errorCb: Function) {
    this.errorCbs.push(errorCb)
  }

  transitionTo (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const route = this.router.match(location, this.current) // 调用match处理那倒route
    this.confirmTransition(route, () => { // 完成回调
      this.updateRoute(route)
      onComplete && onComplete(route)
      this.ensureURL()

      // fire ready cbs once
      if (!this.ready) {
        this.ready = true
        this.readyCbs.forEach(cb => { cb(route) })
      }
    }, err => {  // 取消|失败回调
      if (onAbort) {
        onAbort(err)
      }
      if (err && !this.ready) {
        this.ready = true
        this.readyErrorCbs.forEach(cb => { cb(err) })
      }
    })
  }

  confirmTransition (route: Route, onComplete: Function, onAbort?: Function) {
    const current = this.current //原始的
    const abort = err => {
      // 调用出错或者报错
      if (isError(err)) {
        if (this.errorCbs.length) {
          this.errorCbs.forEach(cb => { cb(err) })
        } else {
          warn(false, 'uncaught error during route navigation:')
          console.error(err)
        }
      }
      // 然后调用取消
      onAbort && onAbort(err)
    }
  if (
      // 相同的route而且父级的matched相同 （疑问？）
      isSameRoute(route, current) &&
      // in the case the route map has been dynamically appended to
      // 在这种情况下，路线图已被动态添加到
      route.matched.length === current.matched.length
    ) {
      this.ensureURL() // 确保url状态？
      return abort() // 调用取消|出错
    }

    const {
      updated,
      deactivated,
      activated
    // 拿到需要操作的record
    } = resolveQueue(this.current.matched, route.matched)

    // 生成好执行队列
    const queue: Array<?NavigationGuard> = [].concat(
      // in-component leave guards // 移开|离开的钩子
      extractLeaveGuards(deactivated),
      // global before hooks // 全局钩子之前
      this.router.beforeHooks,
      // in-component update hooks // 组件中更新的钩子
      extractUpdateHooks(updated),
      // in-config enter guards // 进入的钩子
      activated.map(m => m.beforeEnter),
      // async components // 异步组件的钩子
      resolveAsyncComponents(activated)
    )

    this.pending = route // 标准等待
    const iterator = (hook: NavigationGuard, next) => { // 迭代器
      if (this.pending !== route) { // 运行过程被修改了，取消
        return abort()
      }
      try {
        hook(route, current, (to: any) => {
          if (to === false || isError(to)) {
            // 中止导航，确保当前URL
            // next(false) -> abort navigation, ensure current URL
            this.ensureURL(true)
            abort(to)
          } else if (
            typeof to === 'string' ||
            (typeof to === 'object' && (
              typeof to.path === 'string' ||
              typeof to.name === 'string'
            ))
          ) {
            // next('/') or next({ path: '/' }) -> redirect
            abort() // 取消然后重定向
            if (typeof to === 'object' && to.replace) {
              this.replace(to)
            } else {
              this.push(to)
            }
          } else {
            // confirm transition and pass on the value // 确认转换并传递值
            next(to) // 跳转下一步
          }
        })
      } catch (e) {
        abort(e) // 出错也取消
      }
    }

    // 执行队列
    runQueue(queue, iterator, () => {
      const postEnterCbs = []
      const isValid = () => this.current === route // 如果当前的和route相等那就是有效的
      // wait until async components are resolved before
      // 等到异步组件被解析之前
      // extracting in-component enter guards // 提取组件内输入保护
      const enterGuards = extractEnterGuards(activated, postEnterCbs, isValid) // 取出插入之前的守卫
      const queue = enterGuards.concat(this.router.resolveHooks) // 和完成解析的钩子形成新的队列
      runQueue(queue, iterator, () => { // 执行新的队列
        if (this.pending !== route) {
          return abort() // 同样的是否修改判断，修改就取消
        }
        // 标记状态 ， 调用完成函数
        this.pending = null
        onComplete(route)
        if (this.router.app) {
          // 在nextTick中调用插入的钩子
          this.router.app.$nextTick(() => {
            postEnterCbs.forEach(cb => { cb() })
          })
        }
      })
    })
  }

  // 更新route，有监听事件调用cb，调用after钩子
  updateRoute (route: Route) {
    const prev = this.current
    this.current = route
    this.cb && this.cb(route)
    this.router.afterHooks.forEach(hook => {
      hook && hook(route, prev)
    })
  }
}

/* 标准化base路径 **/
function normalizeBase (base: ?string): string {
  if (!base) { // 无base传入,手动拿base (通过base标签拿,一个页面只有一个base)
    if (inBrowser) {
      // respect <base> tag
      // HTML <base> 元素 指定用于一个文档中包含的所有相对URL的基本URL。一份中只能有一个<base>元素。
      // 一个文档的基本URL, 可以一个脚本使用 document.baseURI查询。
      const baseEl = document.querySelector('base')
      base = (baseEl && baseEl.getAttribute('href')) || '/' // 拿到基础地址
      // strip full URL origin // 带完整URL原点
      base = base.replace(/^https?:\/\/[^\/]+/, '')
    } else {
      base = '/' // 默认根
    }
  }
  // make sure there's the starting slash // 确保有起始斜线
  if (base.charAt(0) !== '/') {
    base = '/' + base
  }
  // remove trailing slash // 去除末尾斜杠
  return base.replace(/\/$/, '')
}

function resolveQueue (
  current: Array<RouteRecord>,
  next: Array<RouteRecord>
): {
  updated: Array<RouteRecord>,
  activated: Array<RouteRecord>,
  deactivated: Array<RouteRecord>
} {
  let i
  // 对比新旧路由的record
  const max = Math.max(current.length, next.length)
  for (i = 0; i < max; i++) {
    if (current[i] !== next[i]) { // 找到不同的
      break
    }
  }
  /**
   * 1. 相同部分更新
   * 2. next不同部分激活|加载
   * 3. current不同部分 取消激活|销毁
   ***/
  return {
    updated: next.slice(0, i),
    activated: next.slice(i),
    deactivated: current.slice(i)
  }
}
//导航守卫的处理
function extractGuards (
  records: Array<RouteRecord>,
  name: string,
  bind: Function,
  reverse?: boolean
): Array<?Function> {
  const guards = flatMapComponents(records, (def, instance, match, key) => { // (comp,instance)
    const guard = extractGuard(def, name) // 定义拿到守卫
    if (guard) { // 包装和返回***
      return Array.isArray(guard)
        ? guard.map(guard => bind(guard, instance, match, key))
        : bind(guard, instance, match, key)
    }
  })
  // 转数组, (子的情况[离开];父的情况[更新])
  return flatten(reverse ? guards.reverse() : guards)
}

// 导航守卫定义
function extractGuard (
  def: Object | Function,
  key: string
): NavigationGuard | Array<NavigationGuard> {
  if (typeof def !== 'function') {
    // extend now so that global mixins are applied.
    def = _Vue.extend(def) // 现在进行扩展，以便应用全局mixin。
  }
  return def.options[key]
}

// 守卫离开
function extractLeaveGuards (deactivated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(deactivated, 'beforeRouteLeave', bindGuard, true)
}

// 组件更新守卫|组件更新
function extractUpdateHooks (updated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(updated, 'beforeRouteUpdate', bindGuard)
}

// 绑定守卫上下文
function bindGuard (guard: NavigationGuard, instance: ?_Vue): ?NavigationGuard {
  if (instance) {
    return function boundRouteGuard () {
      return guard.apply(instance, arguments)
    }
  }
}

// 取出插入的守卫
function extractEnterGuards (
  activated: Array<RouteRecord>,
  cbs: Array<Function>,
  isValid: () => boolean
): Array<?Function> {
  return extractGuards(activated, 'beforeRouteEnter', (guard, _, match, key) => {
    return bindEnterGuard(guard, match, key, cbs, isValid)
  })
}

function bindEnterGuard (
  guard: NavigationGuard,
  match: RouteRecord,
  key: string,
  cbs: Array<Function>,
  isValid: () => boolean
): NavigationGuard {
  return function routeEnterGuard (to, from, next) {
    return guard(to, from, cb => {
      next(cb)
      if (typeof cb === 'function') {
        cbs.push(() => {
          // #750
          // if a router-view is wrapped with an out-in transition,
          // the instance may not have been registered at this time.
          // we will need to poll for registration until current route
          // is no longer valid.
          // 如果router-view用out-in转换包装，则此时可能尚未注册实例。
          // 我们需要轮询注册，直到当前路由不再有效。
          poll(cb, match.instances, key, isValid)
        })
      }
    })
  }
}

function poll (
  cb: any, // somehow flow cannot infer this is a function
  instances: Object,
  key: string,
  isValid: () => boolean
) {
  if (
    instances[key] &&
    !instances[key]._isBeingDestroyed // do not reuse being destroyed instance // 不重用被销毁的实例
  ) {
    cb(instances[key]) //实例存在而且没有被销毁调用cb
    // 有效的设置定时器再来,这是何故?
  } else if (isValid()) {
    setTimeout(() => {
      poll(cb, instances, key, isValid)
    }, 16)
  }
}
