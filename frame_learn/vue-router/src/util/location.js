/* @flow */

import type VueRouter from '../index'
import { parsePath, resolvePath } from './path'
import { resolveQuery } from './query'
import { fillParams } from './params'
import { warn } from './warn'
import { extend } from './misc'

/* 标准化location **/
export function normalizeLocation (
  raw: RawLocation,
  current: ?Route,
  append: ?boolean,
  router: ?VueRouter
): Location {
  // 对原始路由进行转换
  let next: Location = typeof raw === 'string' ? { path: raw } : raw
  // named target (如果name存在,并且返回的话match方法实际会报错的?)
  // 如果是已经标准化的也返回
  if (next.name || next._normalized) {
    return next
  }

  // relative params
  if (!next.path && next.params && current) {
    next = extend({}, next) // 复制一份
    next._normalized = true // 标记
    const params: any = extend(extend({}, current.params), next.params) // 复制params
    if (current.name) { // 更新名字和参数?
      next.name = current.name
      next.params = params
    } else if (current.matched.length) { // 有收集到route和父级(创建route中收集的)
      const rawPath = current.matched[current.matched.length - 1].path
      // 填充参数并返回 将参数转化为 /a/b/c
      next.path = fillParams(rawPath, params, `path ${current.path}`)
    } else if (process.env.NODE_ENV !== 'production') {
      warn(false, `relative params navigation requires a current route.`)
    }
    return next // 返回处理的结果
  }

  // 截取path 返回处理好的{path,query,hash}
  const parsedPath = parsePath(next.path || '')
  const basePath = (current && current.path) || '/' // 拿到原始的path
  const path = parsedPath.path  // 拼接路径或者元素路径
    ? resolvePath(parsedPath.path, basePath, append || next.append)
    : basePath

  // 解析所有query 转化成json
  const query = resolveQuery(
    parsedPath.query,
    next.query,
    router && router.options.parseQuery
  )

  // 获取和拼接正确的hash
  let hash = next.hash || parsedPath.hash
  if (hash && hash.charAt(0) !== '#') {
    hash = `#${hash}`
  }

  return {
    _normalized: true,
    path,
    query,
    hash
  }
}
