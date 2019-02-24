/* @flow */

import type VueRouter from '../index'
import { stringifyQuery } from './query'

const trailingSlashRE = /\/?$/

/**  创建路由(真正用的路由) **/
export function createRoute (
  record: ?RouteRecord, // 路由记录
  location: Location, // 位置
  redirectedFrom?: ?Location, // 重定向的来源
  router?: VueRouter
): Route {
  // 字符串查询
  const stringifyQuery = router && router.options.stringifyQuery

  // 拿到当前位置的查询和且克隆一次
  let query: any = location.query || {}
  try {
    query = clone(query)
  } catch (e) {}

  const route: Route = {
    name: location.name || (record && record.name),
    meta: (record && record.meta) || {},
    path: location.path || '/',
    hash: location.hash || '',
    query,
    params: location.params || {},
    fullPath: getFullPath(location, stringifyQuery), // 生成route就已经生成fullPath
    matched: record ? formatMatch(record) : [] // 拿到一个数组 [父级,↓↓...,本级]
  }
  if (redirectedFrom) { // 把重定向的拼接剩下一个完整的路由
    route.redirectedFrom = getFullPath(redirectedFrom, stringifyQuery)
  }
  return Object.freeze(route)
}

/** 数组和object就是递归调用 不是则返回结果(也属于深度克隆) **/
function clone (value) {
  if (Array.isArray(value)) {
    return value.map(clone)
  } else if (value && typeof value === 'object') {
    const res = {}
    for (const key in value) {
      res[key] = clone(value[key])
    }
    return res
  } else {
    return value
  }
}

// the starting route that represents the initial state
// 表示初始状态的起始路由
export const START = createRoute(null, {
  path: '/'
})

/** 一直向数据第一位添加parent,最后返回结果 **/
function formatMatch (record: ?RouteRecord): Array<RouteRecord> {
  const res = []
  while (record) {
    res.unshift(record)
    record = record.parent
  }
  return res
}

// 把route中的path+param+hash拼接形成完整路径
function getFullPath (
  { path, query = {}, hash = '' },
  _stringifyQuery
): string {
  // 确定编译参数的函数
  const stringify = _stringifyQuery || stringifyQuery
  return (path || '/') + stringify(query) + hash // 将路径+参数+hash
}

/** 
 * 1. b 是跟路由 判断内存a,b指针是否相等
 * 2. 没有b false
 * 3. 都有path --> 要path\hash\query都相等
 * 4. 都有name --> 要name\hash\query\params都相等
 * 5. 其他情况都是false的
 **/
export function isSameRoute (a: Route, b: ?Route): boolean {
  if (b === START) {
    return a === b
  } else if (!b) {
    return false
  } else if (a.path && b.path) {
    return (
      a.path.replace(trailingSlashRE, '') === b.path.replace(trailingSlashRE, '') &&
      a.hash === b.hash &&
      isObjectEqual(a.query, b.query)
    )
  } else if (a.name && b.name) {
    return (
      a.name === b.name &&
      a.hash === b.hash &&
      isObjectEqual(a.query, b.query) &&
      isObjectEqual(a.params, b.params)
    )
  } else {
    return false
  }
}

function isObjectEqual (a = {}, b = {}): boolean {
  // handle null value #1566
  if (!a || !b) return a === b // 防止null 的bug
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  // 1. 长度等
  if (aKeys.length !== bKeys.length) {
    return false
  }
  // 调用every(全都成立才true),字符串完全相等
  return aKeys.every(key => {
    const aVal = a[key]
    const bVal = b[key]
    // check nested equality 嵌套对象的检查
    if (typeof aVal === 'object' && typeof bVal === 'object') {
      return isObjectEqual(aVal, bVal)
    }
    return String(aVal) === String(bVal)
  })
}

/**  
 * 1. 字符串匹配且从0开始匹配 (这样就可以理解成目标可以小于或等于原始的)
 * 2. hash 有必须相等  && 且query的所有的key都要相等
 **/
export function isIncludedRoute (current: Route, target: Route): boolean {
  return (
    current.path.replace(trailingSlashRE, '/').indexOf( 
      target.path.replace(trailingSlashRE, '/')
    ) === 0 &&
    (!target.hash || current.hash === target.hash) &&
    queryIncludes(current.query, target.query)
  )
}

// 判断target和current的所有key是否相等
function queryIncludes (current: Dictionary<string>, target: Dictionary<string>): boolean {
  for (const key in target) {
    if (!(key in current)) {
      return false
    }
  }
  return true
}
