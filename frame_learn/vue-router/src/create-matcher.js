/* @flow */

import type VueRouter from './index'
import { resolvePath } from './util/path'
import { assert, warn } from './util/warn'
import { createRoute } from './util/route'
import { fillParams } from './util/params'
import { createRouteMap } from './create-route-map'
import { normalizeLocation } from './util/location'

export type Matcher = {
  match: (raw: RawLocation, current?: Route, redirectedFrom?: Location) => Route;
  addRoutes: (routes: Array<RouteConfig>) => void;
};

export function createMatcher (
  routes: Array<RouteConfig>,
  router: VueRouter
): Matcher {
  // 处理好路由记录,拿到所有处理结果
  const { pathList, pathMap, nameMap } = createRouteMap(routes)

  // 定义一个函数(意味着在处理的时候可以接着添加)
  function addRoutes (routes) {
    createRouteMap(routes, pathList, pathMap, nameMap)
  }

  // 拿到或者创建 route
  function match (
    raw: RawLocation  ,
    currentRoute?: Route,
    redirectedFrom?: Location
  ): Route {
    // 标准化raw拿到  {_normalized: true, path, query, hash }
    const location = normalizeLocation(raw, currentRoute, false, router)
    const { name } = location

    if (name) {
      const record = nameMap[name] // 拿已经添加到路由记录对应name中的记录
      if (process.env.NODE_ENV !== 'production') {
        // 拿不到路由记录，报错
        warn(record, `Route with name '${name}' does not exist`)
      }
      if (!record) return _createRoute(null, location) // 不存在就创建新的返回
      // 在匹配的regex对象中拿到参数名
      const paramNames = record.regex.keys
        .filter(key => !key.optional)
        .map(key => key.name)

      if (typeof location.params !== 'object') {
        location.params = {}  // 一种防错
      }

      // 将原始路由的params赋值到location中
      if (currentRoute && typeof currentRoute.params === 'object') {
        for (const key in currentRoute.params) {
          if (!(key in location.params) && paramNames.indexOf(key) > -1) {
            location.params[key] = currentRoute.params[key]
          }
        }
      }

      // 有记录的
      if (record) {
        // 处理路径的参数 和缓存,拿到已经拼接好的params
        location.path = fillParams(record.path, location.params, `named route "${name}"`)
        return _createRoute(record, location, redirectedFrom)
      }
    } else if (location.path) {
      location.params = {}
      for (let i = 0; i < pathList.length; i++) {
        const path = pathList[i]
        const record = pathMap[path] //拿到已经处理的记录
        // 只要匹配就创建Route(满足 patch.match(regex))
        if (matchRoute(record.regex, location.path, location.params)) {
          return _createRoute(record, location, redirectedFrom)
        }
      }
    }
    // no match //不匹配创建的
    return _createRoute(null, location)
  }

  // 生成重定向的路由
  function redirect (
    record: RouteRecord,
    location: Location
  ): Route {
    // 拿到原始配置的重定向
    const originalRedirect = record.redirect
    // if函数则直接调用和创建Route
    let redirect = typeof originalRedirect === 'function'
      ? originalRedirect(createRoute(record, location, null, router))
      : originalRedirect

    if (typeof redirect === 'string') {
      redirect = { path: redirect } // 字符串就转化一下
    }

    // 不正确的且不能被解析的redirect
    if (!redirect || typeof redirect !== 'object') {
      if (process.env.NODE_ENV !== 'production') {
        warn(
          false, `invalid redirect option: ${JSON.stringify(redirect)}`
        )
      }
      return _createRoute(null, location) // 直接生成
    }

    // 在重定义路由对象中拿到 name、path 在local中拿到query、hash、params
    const re: Object = redirect
    const { name, path } = re
    let { query, hash, params } = location
    query = re.hasOwnProperty('query') ? re.query : query
    hash = re.hasOwnProperty('hash') ? re.hash : hash
    params = re.hasOwnProperty('params') ? re.params : params

    if (name) {
      // resolved named direct 已解析命名直接拿结果
      const targetRecord = nameMap[name]
      if (process.env.NODE_ENV !== 'production') {
        // 断言没有解析出来name的不跳转
        assert(targetRecord, `redirect failed: named route "${name}" not found.`)
      }
      // 跳转 实际调用createRoute
      return match({
        _normalized: true,
        name,
        query,
        hash,
        params
      }, undefined, location)
    } else if (path) {
      // 1. resolve relative redirect // 相对路由的重定向
      const rawPath = resolveRecordPath(path, record)
      // 2. resolve params // 连接完整参数
      const resolvedPath = fillParams(rawPath, params, `redirect route with path "${rawPath}"`)
      // 3. rematch with existing query and hash // 使用现有查询和哈希重新匹配
      return match({
        _normalized: true,
        path: resolvedPath,
        query,
        hash
      }, undefined, location)
    } else {
      // 不匹配 也是直接生成空的
      if (process.env.NODE_ENV !== 'production') {
        warn(false, `invalid redirect option: ${JSON.stringify(redirect)}`)
      }
      return _createRoute(null, location)
    }
  }

  // 别名路径的处理
  function alias (
    record: RouteRecord,
    location: Location,
    matchAs: string
  ): Route {
    // 先拿连接好的param
    const aliasedPath = fillParams(matchAs, location.params, `aliased route with path "${matchAs}"`)
    const aliasedMatch = match({ // 拿到创建了route
      _normalized: true,
      path: aliasedPath
    })
    /** 拿得到之后
     * 1. 拿到父子关系的record
     * 2. 拿到当前的record
     * 3. 向location赋值解析的params （**）
     * 4. 创建route
     ***/
    if (aliasedMatch) {
      const matched = aliasedMatch.matched
      const aliasedRecord = matched[matched.length - 1]
      location.params = aliasedMatch.params // （**）
      return _createRoute(aliasedRecord, location)
    }
    return _createRoute(null, location)
  }

  function _createRoute (
    record: ?RouteRecord,
    location: Location,
    redirectedFrom?: Location
  ): Route {
    if (record && record.redirect) {
      return redirect(record, redirectedFrom || location)
    }
    if (record && record.matchAs) {
      return alias(record, location, record.matchAs)
    }
    return createRoute(record, location, redirectedFrom, router)
  }

  // 在该方法中,都是在定义方法,然后返回了2个方法
  // 一个match -->
  // 一个其实是调用createRouteMap向现有路由记录里面再添加路由
  return {
    match,
    addRoutes
  }
}

function matchRoute (
  regex: RouteRegExp, // 这个东东继承正则对象
  path: string,
  params: Object
): boolean {
  // 将路径放入前面生成的正则
  const m = path.match(regex)

  if (!m) {
    return false // 不匹配
  } else if (!params) {
    return true // 匹配,且不用匹配参数
  }

  for (let i = 1, len = m.length; i < len; ++i) {
    const key = regex.keys[i - 1] // 拿到{ name: string, optional: boolean }
    const val = typeof m[i] === 'string' ? decodeURIComponent(m[i]) : m[i]
    if (key) {
      // Fix #1994: using * with props: true generates a param named 0
      params[key.name || 'pathMatch'] = val // 对参数进行赋值||默认key赋值
    }
  }

  return true // 处理完也返回匹配
}

// 拿到拼接好的路径
function resolveRecordPath (path: string, record: RouteRecord): string {
  return resolvePath(path, record.parent ? record.parent.path : '/', true)
}
