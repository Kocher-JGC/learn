/* @flow */

import { warn } from './warn'
import Regexp from 'path-to-regexp'

// $flow-disable-line
const regexpCompileCache: {
  [key: string]: Function
} = Object.create(null)

// 填充参数并返回 将参数转化为 /a/b/c
export function fillParams (
  path: string,
  params: ?Object,
  routeMsg: string
): string {
  params = params || {}
  try {
    // 没缓存就Regexp.compile对path进行处理
    const filler =
      regexpCompileCache[path] ||
      (regexpCompileCache[path] = Regexp.compile(path))

    // Fix #2505 resolving asterisk routes { name: 'not-found', params: { pathMatch: '/not-found' }}
    if (params.pathMatch) params[0] = params.pathMatch // 特殊情况的处理

    // 填充参数并返回 将参数转化为 /a/b/c
    return filler(params, { pretty: true })
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      warn(false, `missing param for ${routeMsg}: ${e.message}`)
    }
    return '' // 参数解析失败(解析失败)
  } finally {
    // delete the 0 if it was added // 删除之前添加的param
    delete params[0]
  }
}
