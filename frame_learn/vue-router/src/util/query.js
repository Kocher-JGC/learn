/* @flow */

import { warn } from './warn'

const encodeReserveRE = /[!'()*]/g
const encodeReserveReplacer = c => '%' + c.charCodeAt(0).toString(16)
const commaRE = /%2C/g

// fixed encodeURIComponent which is more conformant to RFC3986:
// - escapes [!'()*]
// - preserve commas
const encode = str => encodeURIComponent(str)
  .replace(encodeReserveRE, encodeReserveReplacer) // 编码的时候将几个特殊的转化%+16进制的
  .replace(commaRE, ',') // 把,换回来

const decode = decodeURIComponent

// 将url的参数解析成json并加上额外的参数
// 解析查询
export function resolveQuery (
  query: ?string,
  extraQuery: Dictionary<string> = {},
  _parseQuery: ?Function
): Dictionary<string> {
  const parse = _parseQuery || parseQuery
  let parsedQuery
  try {
    parsedQuery = parse(query || '')
  } catch (e) {
    process.env.NODE_ENV !== 'production' && warn(false, e.message)
    parsedQuery = {}
  }
  for (const key in extraQuery) { // 添加额外的query
    parsedQuery[key] = extraQuery[key]
  }
  return parsedQuery
}

// 把url的参数解析成json
function parseQuery (query: string): Dictionary<string> {
  const res = {}

  query = query.trim().replace(/^(\?|#|&)/, '') // 去掉?,#,&

  if (!query) {
    return res // 空的query
  }

  // 切开参数的第一刀
  query.split('&').forEach(param => {
    const parts = param.replace(/\+/g, ' ').split('=') // 把+去掉然后再切一刀
    const key = decode(parts.shift()) // 第一是key拿到并解码
    const val = parts.length > 0 //用=链接字符串(为什么要有=链接,难道是下面编译的时候有2维?)
      ? decode(parts.join('='))
      : null

    // 添加结果一次到多次
    if (res[key] === undefined) {
      res[key] = val // 第一次
    } else if (Array.isArray(res[key])) {
      res[key].push(val) // 第2+次
    } else {
      res[key] = [res[key], val] // 第2次
    }
  })

  return res
}

/** 就是编译和生成URL参数的 **/
export function stringifyQuery (obj: Dictionary<string>): string {
  const res = obj ? Object.keys(obj).map(key => {
    const val = obj[key]

    if (val === undefined) {
      return ''
    }

    if (val === null) {
      return encode(key) // 没有值对key进行编码
    }

    // 是数组的话会再来一次
    if (Array.isArray(val)) {
      const result = []
      val.forEach(val2 => {
        if (val2 === undefined) {
          return
        }
        if (val2 === null) {
          result.push(encode(key))
        } else {
          result.push(encode(key) + '=' + encode(val2))
        }
      })
      return result.join('&')
    }

    // 编码key和val并用=链接
    return encode(key) + '=' + encode(val)
  }).filter(x => x.length > 0).join('&') : null // 去除无效的,以及用&链接
  return res ? `?${res}` : ''
}
