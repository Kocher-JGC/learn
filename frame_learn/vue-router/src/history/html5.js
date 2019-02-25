/* @flow */

import type Router from '../index'
import { History } from './base'
import { cleanPath } from '../util/path'
import { START } from '../util/route'
import { setupScroll, handleScroll } from '../util/scroll'
import { pushState, replaceState, supportsPushState } from '../util/push-state'

export class HTML5History extends History {
  constructor (router: Router, base: ?string) {
    super(router, base)

    // 拿到滚动行为函数\和是否支持滚动
    const expectScroll = router.options.scrollBehavior
    const supportsScroll = supportsPushState && expectScroll

    if (supportsScroll) {
      setupScroll() // 绑定popstate事件 --> 用于获取触发滚动位置
    }

    // 拿到当前所有url
    const initLocation = getLocation(this.base)
    /* history.[back\forward\go\replaceState\pushState] 都会触发 **/
    window.addEventListener('popstate', e => {
      const current = this.current

      // Avoiding first `popstate` event dispatched in some browsers but first
      // history route not updated since async guard at the same time.
      // 避免在某些浏览器中分发第一个“popstate”事件，但由于异步保护，第一次历史路由没有更新。
      const location = getLocation(this.base)
      if (this.current === START && location === initLocation) {
        return
      }

      // 路由跳转好了移动滚动
      this.transitionTo(location, route => {
        if (supportsScroll) {
          handleScroll(router, route, current, true)
        }
      })
    })
  }

  go (n: number) { // 前往某一条历时
    window.history.go(n)
  }

  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(location, route => {
      // 完成的时候触发浏览器的事件[进行历史添加或者替换]，以及滚动
      pushState(cleanPath(this.base + route.fullPath))
      handleScroll(this.router, route, fromRoute, false)
      onComplete && onComplete(route)
    }, onAbort)
  }

  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(location, route => {
      // 就是调用pushState(,true),[replaceState]进行替换history
      replaceState(cleanPath(this.base + route.fullPath))
      // 然后滚动和完成调用
      handleScroll(this.router, route, fromRoute, false)
      onComplete && onComplete(route)
    }, onAbort)
  }

  // 确保url --> ??
  ensureURL (push?: boolean) {
    if (getLocation(this.base) !== this.current.fullPath) {
      const current = cleanPath(this.base + this.current.fullPath)
      push ? pushState(current) : replaceState(current)
    }
  }

  // 获取当前url --> base
  getCurrentLocation (): string {
    return getLocation(this.base)
  }
}

/**
 * 1. 获取当前localtion
 * 2. 如果有base,对path进行剪切
 * 3. 连接path+query+hash 返回
 * **/
export function getLocation (base: string): string {
  let path = decodeURI(window.location.pathname) // 域名之后的url
  if (base && path.indexOf(base) === 0) {
    path = path.slice(base.length)
  }
  return (path || '/') + window.location.search + window.location.hash
}
