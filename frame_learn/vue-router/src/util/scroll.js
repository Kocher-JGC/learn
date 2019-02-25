/* @flow */

import type Router from '../index'
import { assert } from './warn'
import { getStateKey, setStateKey } from './push-state'

const positionStore = Object.create(null)

//  每当处于激活状态的历史记录条目发生变化时,popstate事件就会在对应window对象上触发.
export function setupScroll () {
  // Fix for #1585 for Firefox
  // Fix for #2195 Add optional third attribute to workaround a bug in safari https://bugs.webkit.org/show_bug.cgi?id=182678
  // 添加第3个参数来解决ff的bug
  window.history.replaceState({ key: getStateKey() }, '', window.location.href.replace(window.location.origin, ''))
  /* history.[back\forward\go\replaceState\pushState] 都会触发 **/
  window.addEventListener('popstate', e => {
    saveScrollPosition() // 先储存位置
    if (e.state && e.state.key) {
      setStateKey(e.state.key) // 设置state的key
    }
  })
}

export function handleScroll (
  router: Router,
  to: Route,
  from: Route,
  isPop: boolean
) {
  if (!router.app) { // 要求vueRouter存在
    return
  }

  // 获取选项中的滚动行为
  const behavior = router.options.scrollBehavior
  if (!behavior) {
    return
  }

  // 断言 behavior 行为必须是一个函数
  if (process.env.NODE_ENV !== 'production') {
    assert(typeof behavior === 'function', `scrollBehavior must be a function`)
  }

  // wait until re-render finishes before scrolling
  // 在滚动之前，等待重新渲染完成
  router.app.$nextTick(() => { // 在渲染完成的nextTick调用滚动
    // 拿到滚动位置，并进行滚动检查
    const position = getScrollPosition()
    const shouldScroll = behavior.call(router, to, from, isPop ? position : null)

    if (!shouldScroll) { // 不能滚的
      return
    }

    // 执行滚动或者滚动失败
    if (typeof shouldScroll.then === 'function') {
      shouldScroll.then(shouldScroll => {
        scrollToPosition((shouldScroll: any), position)
      }).catch(err => {
        if (process.env.NODE_ENV !== 'production') {
          assert(false, err.toString())
        }
      })
    } else {
      scrollToPosition(shouldScroll, position)
    }
  })
}

export function saveScrollPosition () {
  const key = getStateKey() // 获取当前key
  if (key) {
    positionStore[key] = { // 对应储存位置
      x: window.pageXOffset,
      y: window.pageYOffset
    }
  }
}

// 获取当前key 对应返回储存的位置
function getScrollPosition (): ?Object {
  const key = getStateKey()
  if (key) {
    return positionStore[key]
  }
}

// 获取元素的位置
function getElementPosition (el: Element, offset: Object): Object {
  const docEl: any = document.documentElement
  const docRect = docEl.getBoundingClientRect() //
  const elRect = el.getBoundingClientRect() //
  return {
    x: elRect.left - docRect.left - offset.x,
    y: elRect.top - docRect.top - offset.y
  }
}

//  有效的位置
function isValidPosition (obj: Object): boolean {
  return isNumber(obj.x) || isNumber(obj.y)
}

// 标准化位置,防止有数据获取出错
function normalizePosition (obj: Object): Object {
  return {
    x: isNumber(obj.x) ? obj.x : window.pageXOffset,
    y: isNumber(obj.y) ? obj.y : window.pageYOffset
  }
}

// 标准化offset 没获取到的为0
function normalizeOffset (obj: Object): Object {
  return {
    x: isNumber(obj.x) ? obj.x : 0,
    y: isNumber(obj.y) ? obj.y : 0
  }
}

function isNumber (v: any): boolean {
  return typeof v === 'number'
}

/*  滚动至一定位置 **/
function scrollToPosition (shouldScroll, position) {
  const isObject = typeof shouldScroll === 'object'
  if (isObject && typeof shouldScroll.selector === 'string') {
    const el = document.querySelector(shouldScroll.selector) // 利用选择器获取元素
    if (el) {
      // 拿到object 的 offset ,并 标准化
      let offset = shouldScroll.offset && typeof shouldScroll.offset === 'object' ? shouldScroll.offset : {}
      offset = normalizeOffset(offset)
      position = getElementPosition(el, offset) // 获取元素的position
    } else if (isValidPosition(shouldScroll)) {
      position = normalizePosition(shouldScroll) // 获取不到一样直接拿坐标
    }
    // 没有元素那就直接获取位置 ,获取到了就可以滚
  } else if (isObject && isValidPosition(shouldScroll)) {
    position = normalizePosition(shouldScroll)
  }

  if (position) {
    window.scrollTo(position.x, position.y)
  }
}
