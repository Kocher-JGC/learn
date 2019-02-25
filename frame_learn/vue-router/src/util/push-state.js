/* @flow */

import { inBrowser } from './dom'
import { saveScrollPosition } from './scroll'

// 判断history是否支持pushState
export const supportsPushState = inBrowser && (function () {
  const ua = window.navigator.userAgent //拿到内核信息

  // 支持情况
  if (
    (ua.indexOf('Android 2.') !== -1 || ua.indexOf('Android 4.0') !== -1) &&
    ua.indexOf('Mobile Safari') !== -1 &&
    ua.indexOf('Chrome') === -1 &&
    ua.indexOf('Windows Phone') === -1
  ) {
    return false
  }

  // 判断history是否支持pushState
  return window.history && 'pushState' in window.history
})()

// use User Timing api (if present) for more accurate key precision
// 使用用户计时API（如果存在）以获得更精确的密钥精度
const Time = inBrowser && window.performance && window.performance.now
  ? window.performance
  : Date

let _key: string = genKey() // 利用时间获取_key

function genKey (): string {
  return Time.now().toFixed(3)
}

export function getStateKey () {// 拿key
  return _key
}

export function setStateKey (key: string) { // 设置新的key
  _key = key
}

export function pushState (url?: string, replace?: boolean) {
  saveScrollPosition() // 储存当前滚动位置
  // try...catch the pushState call to get around Safari
  // 试着利用try catch 绕过 Safari
  // DOM Exception 18 where it limits to 100 pushState calls
  //   DOM异常18，其中它限制为100个pushstate调用
  const history = window.history
  try {
    if (replace) { // 替换历史
      history.replaceState({ key: _key }, '', url)
    } else {
      // 添加新历史
      _key = genKey()
      history.pushState({ key: _key }, '', url)
    }
  } catch (e) {
    // 失败直接跳转
    window.location[replace ? 'replace' : 'assign'](url)
  }
}

export function replaceState (url?: string) {
  pushState(url, true)
}
