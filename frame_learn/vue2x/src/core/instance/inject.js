/* @flow */

import { hasOwn } from 'shared/util'
import { warn, hasSymbol } from '../util/index'
import { defineReactive, toggleObserving } from '../observer/index'

/** 初始化供应商 **/
export function initProvide (vm: Component) {
  const provide = vm.$options.provide
  if (provide) { // 供应商是函数直接调用 赋值 到vm._provied
    vm._provided = typeof provide === 'function'
      ? provide.call(vm)
      : provide
  }
}
/** 初始化注入 **/
export function initInjections (vm: Component) {
  //解析好所需要的注入
  const result = resolveInject(vm.$options.inject, vm)
  if (result) {
    toggleObserving(false) // 关闭监听
    // 并重新设置数据绑定的语法糖
    Object.keys(result).forEach(key => {
      /* istanbul ignore else */
      if (process.env.NODE_ENV !== 'production') {
        defineReactive(vm, key, result[key], () => {
          warn(
            `Avoid mutating an injected value directly since the changes will be ` +
            `overwritten whenever the provided component re-renders. ` +
            `injection being mutated: "${key}"`,
            vm
          )
        })
      } else {
        defineReactive(vm, key, result[key])
      }
    })
    toggleObserving(true) // 设置完成后开启
  }
}

/** 解析注入 **/
export function resolveInject (inject: any, vm: Component): ?Object {
  if (inject) {
    // inject is :any because flow is not smart enough to figure out cached
    const result = Object.create(null)
    // 拿到可以枚举的key
    const keys = hasSymbol
      ? Reflect.ownKeys(inject).filter(key => { // es6 拿所有key 然后再filter可以枚举的
        /* istanbul ignore next */
        return Object.getOwnPropertyDescriptor(inject, key).enumerable
      })
      : Object.keys(inject)

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const provideKey = inject[key].from // 供应商的key
      let source = vm
      while (source) { // 向上查找，拿到key对应的_provided[providekey]
        if (source._provided && hasOwn(source._provided, provideKey)) {
          result[key] = source._provided[provideKey]
          break
        }
        source = source.$parent
      }
      if (!source) { // 找到顶级也没有的就拿默认的
        if ('default' in inject[key]) {
          const provideDefault = inject[key].default
          result[key] = typeof provideDefault === 'function' // 检查是调用还是直接赋值
            ? provideDefault.call(vm)
            : provideDefault
        } else if (process.env.NODE_ENV !== 'production') {
          warn(`Injection "${key}" not found`, vm)
        }
      }
    }
    return result
  }
}
