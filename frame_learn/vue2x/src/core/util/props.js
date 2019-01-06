/* @flow */

import { warn } from './debug'
import { observe, toggleObserving, shouldObserve } from '../observer/index'
import {
  hasOwn,
  isObject,
  toRawType,
  hyphenate,
  capitalize,
  isPlainObject
} from 'shared/util'

type PropOptions = {
  type: Function | Array<Function> | null,
  default: any,
  required: ?boolean,
  validator: ?Function
};

export function validateProp (
  key: string,
  propOptions: Object,
  propsData: Object,
  vm?: Component
): any {
  const prop = propOptions[key] // opts下面的值
  const absent = !hasOwn(propsData, key) // 是否再poprsData里面
  let value = propsData[key] // 真正的值
  // boolean casting
  const booleanIndex = getTypeIndex(Boolean, prop.type)
  // type 含有布尔
  if (booleanIndex > -1) {
    // 如果key不在propsData里面而且没有defaul （验证失败）
    if (absent && !hasOwn(prop, 'default')) {
      value = false
      // 如果值为空或者值和key转驼峰后相等
    } else if (value === '' || value === hyphenate(key)) {
      // only cast empty string / same name to boolean if
      // boolean has higher priority
      // 如果布尔值具有更高的优先级，则仅将空字符串/相同名称强制转换为布尔值(注意)
      const stringIndex = getTypeIndex(String, prop.type)
      if (stringIndex < 0 || booleanIndex < stringIndex) {
        value = true // 强制布尔
      }
    }
  }
  // check default value
  if (value === undefined) {
    // 无值拿默认值
    value = getPropDefaultValue(vm, prop, key)
    // since the default value is a fresh copy,
    // make sure to observe it.
    // 由于默认值是一个新的副本，请确保观察它。
    const prevShouldObserve = shouldObserve // 缓存当前状态
    toggleObserving(true) //强制开启
    observe(value) // 调用观察者观察值的变化
    toggleObserving(prevShouldObserve) // 还原状态
  }
  if (
    process.env.NODE_ENV !== 'production' &&
    // skip validation for weex recycle-list child component props
    // 跳过WEEX回收列表子组件属性的验证
    !(__WEEX__ && isObject(value) && ('@binding' in value))
  ) {
    assertProp(prop, key, value, vm, absent)
  }
  return value // 返回验证的结果、元素获取的值
}

/**
 * Get the default value of a prop.
 */
function getPropDefaultValue (vm: ?Component, prop: PropOptions, key: string): any {
  // no default, return undefined 没有默认的
  if (!hasOwn(prop, 'default')) {
    return undefined
  }
  const def = prop.default
  // warn against non-factory defaults for Object & Array
  // 针对对象和数组的默认值发出警告
  if (process.env.NODE_ENV !== 'production' && isObject(def)) {
    warn(
      'Invalid default value for prop "' + key + '": ' +
      'Props with type Object/Array must use a factory function ' +
      'to return the default value.',
      vm
    )
  }
  // the raw prop value was also undefined from previous render,
  // return previous default value to avoid unnecessary watcher trigger
  // 原始属性值还未从以前的渲染中定义，请返回以前的默认值以避免不必要的观察程序触发器
  if (vm && vm.$options.propsData &&
    vm.$options.propsData[key] === undefined &&
    vm._props[key] !== undefined
  ) {
    return vm._props[key] // 返回旧的默认值
  }
  // call factory function for non-Function types
  // a value is Function if its prototype is function even across different execution context
  // 调用非函数类型的工厂函数如果其原型是函数，则值是函数，即使在不同的执行上下文中也是如此
  // 函数就调用不是函数就返回
  return typeof def === 'function' && getType(prop.type) !== 'Function' // (注意这个Function的判断)
    ? def.call(vm)
    : def
}

/**
 * Assert whether a prop is valid.
 * 断言prop是否有效（注意：这个验证有点绕口，但是很值得学习）
 */
function assertProp (
  prop: PropOptions,
  name: string,
  value: any,
  vm: ?Component,
  absent: boolean
) {
  // 如果required而且key不在propsData里面（？）
  if (prop.required && absent) {
    warn(
      'Missing required prop: "' + name + '"',
      vm
    )
    return
  }
  // 值为空 而且 不是必须的 直接返回
  if (value == null && !prop.required) {
    return
  }
  let type = prop.type
  // 当且仅当type为(true、flase、'')时候valid为真
  // 所以通常情况下valid为false
  let valid = !type || type === true
  const expectedTypes = [] // 预期的类型
  if (type) {
    if (!Array.isArray(type)) {
      type = [type] // 强制type为数组
    }
    // valid为true退出（因为需要再数组里面找出正确的type，而当找到了就退出循环）
    for (let i = 0; i < type.length && !valid; i++) {
      // 拿到验证的结果和type getType后的字符串
      const assertedType = assertType(value, type[i])
      expectedTypes.push(assertedType.expectedType || '')
      valid = assertedType.valid
    }
  }
  if (!valid) { // 而valid为false报警告
    warn(
      `Invalid prop: type check failed for prop "${name}".` +
      ` Expected ${expectedTypes.map(capitalize).join(', ')}` +
      `, got ${toRawType(value)}.`,
      vm
    )
    return
  }
  const validator = prop.validator
  if (validator) { // 有验证器而且值的验证不通过
    if (!validator(value)) {
      warn(
        'Invalid prop: custom validator check failed for prop "' + name + '".',
        vm
      )
    }
  }
}

const simpleCheckRE = /^(String|Number|Boolean|Function|Symbol)$/

function assertType (value: any, type: Function): {
  valid: boolean;
  expectedType: string;
} {
  let valid
  const expectedType = getType(type)
  // 获取类型判断是否为基本类型
  if (simpleCheckRE.test(expectedType)) {
    const t = typeof value
    valid = t === expectedType.toLowerCase() // 判断类型是否真的全等
    // for primitive wrapper objects 对于基本包装对象
    if (!valid && t === 'object') { // 如果value和type的类型不等而且value是一个obj
      valid = value instanceof type // 把值修正为vaule的指针是否指向type
    }
  } else if (expectedType === 'Object') {
    valid = isPlainObject(value) // Obj 就判断是否为[Object Object]
  } else if (expectedType === 'Array') {
    valid = Array.isArray(value) // arr就判断arr
  } else {
    valid = value instanceof type // 都不是也是判断指针
  }
  return {
    valid,
    expectedType
  }
}

/**
 * Use function string name to check built-in types,
 * because a simple equality check will fail when running
 * across different vms / iframes.
 * 注意：使用函数字符串名称检查内置类型，因为在不同的vms/iframe之间运行时，简单的相等性检查将失败。
 */
function getType (fn) { // 检验类型相等 注意这个正则。
  const match = fn && fn.toString().match(/^\s*function (\w+)/)
  return match ? match[1] : ''
}

// type全等 实际上是字符串全等
function isSameType (a, b) {
  return getType(a) === getType(b)
}

// 用于检查基本类型的相等 如 Boolean === Boolean
function getTypeIndex (type, expectedTypes): number {
  if (!Array.isArray(expectedTypes)) { // 不是数组就判断函数是否全等
    return isSameType(expectedTypes, type) ? 0 : -1
  }
  // 是一个数组就循环判断
  for (let i = 0, len = expectedTypes.length; i < len; i++) {
    if (isSameType(expectedTypes[i], type)) {
      return i
    }
  }
  return -1
}
