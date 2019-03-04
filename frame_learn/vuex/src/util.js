/**
 * Get the first item that pass the test
 * by second argument function
 * 获取通过第二个参数函数传递TES的第一个项
 *
 * @param {Array} list
 * @param {Function} f
 * @return {*}
 */
export function find (list, f) {
  return list.filter(f)[0]
}

/**
 * Deep copy the given object considering circular structure.
 * This function caches all nested objects and its copies.
 * If it detects circular structure, use cached copy to avoid infinite loop.
 * 
 * 考虑到圆形结构，对给定对象进行深度复制。
 * 此函数缓存所有嵌套对象及其副本。
 * 如果检测到循环结构，请使用缓存副本以避免无限循环。
 *
 * @param {*} obj
 * @param {Array<Object>} cache
 * @return {*}
 * 深度拷贝而且防止死循环
 */
export function deepCopy (obj, cache = []) {
  // just return if obj is immutable value // 是null或者不是obj
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  // if obj is hit, it is in circular structure
  // 如果obj找到了,则为环状的obj (防止死循环)
  const hit = find(cache, c => c.original === obj)
  if (hit) {
    return hit.copy
  }

  const copy = Array.isArray(obj) ? [] : {}
  // put the copy into cache at first
  // because we want to refer it in recursive deepCopy
  // 如果命中了obj，它是在循环结构中，首先将副本放入缓存中，因为我们希望在递归deepcopy中引用它。
  cache.push({
    original: obj,
    copy
  })

  // 拿到数组||对象的key 进行枚举,调用深度拷贝进行赋值  ( 真高 )
  Object.keys(obj).forEach(key => {
    copy[key] = deepCopy(obj[key], cache)
  })

  return copy
}

/**
 * forEach for object // 枚举对象并调用传入的fn
 */
export function forEachValue (obj, fn) {
  Object.keys(obj).forEach(key => fn(obj[key], key))
}

// 简单判断obj
export function isObject (obj) {
  return obj !== null && typeof obj === 'object'
}

// 判断promise
export function isPromise (val) {
  return val && typeof val.then === 'function'
}

// 进行断言的
export function assert (condition, msg) {
  if (!condition) throw new Error(`[vuex] ${msg}`)
}
