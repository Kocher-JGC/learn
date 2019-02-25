/* @flow */

import { _Vue } from '../install'
import { warn, isError } from './warn'

/* 解析异步组件 **/
export function resolveAsyncComponents (matched: Array<RouteRecord>): Function {
  // 返回一个函数用于异步路由解析完，自动next调用
  return (to, from, next) => {
    let hasAsync = false
    let pending = 0
    let error = null

    // matched --> 一个父 ->子的record数组
    flatMapComponents(matched, (def, _, match, key) => {
      // if it's a function and doesn't have cid attached,
      // assume it's an async component resolve function.
      // we are not using Vue's default async resolving mechanism because
      // we want to halt the navigation until the incoming component has been
      // resolved.
      /** 如果它是一个函数，并且没有附加cid，
       * 那么假设它是一个异步组件解析函数。
      * 我们不使用Vue的默认异步解析机制，
      * 因为我们希望在解析传入组件之前停止导航。
      **/
      if (typeof def === 'function' && def.cid === undefined) {
        hasAsync = true
        pending++

        // promise 成功回调的函数
        const resolve = once(resolvedDef => {
          if (isESModule(resolvedDef)) {
            resolvedDef = resolvedDef.default // 对es6模型的处理
          }
          // save resolved on async factory in case it's used elsewhere
          // 保存已解析的异步工厂，以防在其他地方使用
          def.resolved = typeof resolvedDef === 'function'
            ? resolvedDef
            : _Vue.extend(resolvedDef) // 生成一个vue的构造函数
          match.components[key] = resolvedDef // 保存组件
          pending-- // 该异步组件解析结束,等待减少一个
          if (pending <= 0) {
            next()
          }
        })

        // 失败回调的函数
        const reject = once(reason => {
          const msg = `Failed to resolve async component ${key}: ${reason}`
          process.env.NODE_ENV !== 'production' && warn(false, msg)
          if (!error) {
            error = isError(reason)
              ? reason
              : new Error(msg)
            next(error) // next并报错
          }
        })

        let res
        try {
          res = def(resolve, reject) // 调用传入的函数和传入成功和失败的回调
        } catch (e) {
          reject(e)
        }
        if (res) {
          if (typeof res.then === 'function') {
            res.then(resolve, reject) // promise 传入成功和失败
          } else {
            // new syntax in Vue 2.3 // 对新方法异步组件then的支持
            const comp = res.component
            if (comp && typeof comp.then === 'function') {
              comp.then(resolve, reject)
            }
          }
        }
      }
    })

    if (!hasAsync) next() // 不用等待就跑了
  }
}

// map --> matched解析 --> 返回函数数组
export function flatMapComponents (
  matched: Array<RouteRecord>,
  fn: Function
): Array<?Function> {
  return flatten(matched.map(m => { // map每一个record
    // 对其comp接着map以及传入对应的comp,instances(实例),当前record,key
    return Object.keys(m.components).map(key => fn(
      m.components[key],
      m.instances[key],
      m, key
    ))
  }))
}

// 连接生成一个(真)数组
export function flatten (arr: Array<any>): Array<any> {
  return Array.prototype.concat.apply([], arr)
}

const hasSymbol = // 能够使用hasSymbol
  typeof Symbol === 'function' &&
  typeof Symbol.toStringTag === 'symbol'

  // 是否es6的module
function isESModule (obj) {
  return obj.__esModule || (hasSymbol && obj[Symbol.toStringTag] === 'Module')
}

// in Webpack 2, require.ensure now also returns a Promise
// so the resolve/reject functions may get called an extra time
// if the user uses an arrow function shorthand that happens to
// return that Promise.
/* 在Webpack 2中，require。确保now还返回一个Promise，
* 这样，如果用户使用一个箭头函数简写，碰巧返回了该Promise，
* 解析/拒绝函数可能会被额外调用一段时间。 **/
function once (fn) {
  let called = false
  return function (...args) {
    if (called) return
    called = true
    return fn.apply(this, args)
  }
}
