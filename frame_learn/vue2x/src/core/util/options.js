/* @flow */

import config from '../config'
import { warn } from './debug'
import { nativeWatch } from './env'
import { set } from '../observer/index'

import {
  ASSET_TYPES,
  LIFECYCLE_HOOKS
} from 'shared/constants'

import {
  extend,
  hasOwn,
  camelize,
  toRawType,
  capitalize,
  isBuiltInTag,
  isPlainObject
} from 'shared/util'

/**
 * Option overwriting strategies are functions that handle
 * how to merge a parent option value and a child option
 * value into the final value.
 * 选项覆盖策略是处理如何将父选项值和子选项值合并到最终值的函数。
 */
const strats = config.optionMergeStrategies // 弱引用，在此处添加各种方法

/**
 * Options with restrictions
 */
if (process.env.NODE_ENV !== 'production') {
  strats.el = strats.propsData = function (parent, child, vm, key) {
    if (!vm) {
      warn(
        `option "${key}" can only be used during instance ` +
        'creation with the `new` keyword.'
      )
    }
    return defaultStrat(parent, child) // 默认策略
  }
}

/**
 * Helper that recursively merges two data objects together.
 * 将两个数据对象递归合并在一起的帮助程序。
 * 思考：没有的才set进去，有的不管了？？
 */
function mergeData (to: Object, from: ?Object): Object {
  if (!from) return to // 只有一个没法合并
  let key, toVal, fromVal
  const keys = Object.keys(from) // 拿到keys
  for (let i = 0; i < keys.length; i++) {
    key = keys[i]
    toVal = to[key]
    fromVal = from[key]
    if (!hasOwn(to, key)) {
      set(to, key, fromVal) // 在元素data上没有那就set进去
      // 如果2个值都是[Object Object]递归调用
    } else if (isPlainObject(toVal) && isPlainObject(fromVal)) {
      mergeData(toVal, fromVal)
    }
  }
  return to
}

/**
 * Data
 * 存在和不存在vm都一样
 * 是函数就调用不是函数直接传入然后mergeData
 * 最后返回merge后的数据
 * （不同的是vm不存在parentVal和childVal必须存在）
 * 写法有点有趣不理解作者的用意
 */
export function mergeDataOrFn (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  if (!vm) {
    // in a Vue.extend merge, both should be functions
    // 在vue.extend合并中，两者都应该是函数
    if (!childVal) {
      return parentVal
    }
    if (!parentVal) {
      return childVal
    }
    // when parentVal & childVal are both present,
    // we need to return a function that returns the
    // merged result of both functions... no need to
    // check if parentVal is a function here because
    // it has to be a function to pass previous merges.
    // 当parentval和childval都存在时，我们需要返回一个函数，
    // 该函数返回两个函数的合并结果…这里不需要检查parentval是否是函数，
    // 因为它必须是传递以前合并的函数。
    return function mergedDataFn () {
      return mergeData(
        typeof childVal === 'function' ? childVal.call(this, this) : childVal,
        typeof parentVal === 'function' ? parentVal.call(this, this) : parentVal
      )
    }
  } else {
    return function mergedInstanceDataFn () {
      // instance merge
      const instanceData = typeof childVal === 'function'
        ? childVal.call(vm, vm)
        : childVal
      const defaultData = typeof parentVal === 'function'
        ? parentVal.call(vm, vm)
        : parentVal
      if (instanceData) {
        return mergeData(instanceData, defaultData)
      } else {
        return defaultData
      }
    }
  }
}

strats.data = function (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  if (!vm) {
    // 实例不存在childVal存在的时候childVal必须是个函数
    if (childVal && typeof childVal !== 'function') {
      process.env.NODE_ENV !== 'production' && warn(
        'The "data" option should be a function ' +
        'that returns a per-instance value in component ' +
        'definitions.',
        vm
      )

      return parentVal
    }
    return mergeDataOrFn(parentVal, childVal)
  }

  return mergeDataOrFn(parentVal, childVal, vm)
}

/**
 * Hooks and props are merged as arrays.
 */
function mergeHook (
  parentVal: ?Array<Function>,
  childVal: ?Function | ?Array<Function>
): ?Array<Function> {
  // 子存在 ： 而且父存在  父 + 子
  //         父不存在 、 子强制为数组返回
  return childVal
    ? parentVal
      ? parentVal.concat(childVal)
      : Array.isArray(childVal)
        ? childVal
        : [childVal]
    : parentVal // 子不存在直接拿父
}

LIFECYCLE_HOOKS.forEach(hook => {
  strats[hook] = mergeHook
})

/**
 * Assets
 *
 * When a vm is present (instance creation), we need to do
 * a three-way merge between constructor options, instance
 * options and parent options.
 * 当存在一个VM（实例创建）时，我们需要在构造函数选项、实例选项和父选项之间进行三向合并。
 */
function mergeAssets (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): Object {
  const res = Object.create(parentVal || null)
  if (childVal) {
    process.env.NODE_ENV !== 'production' && assertObjectType(key, childVal, vm)
    return extend(res, childVal) // 对象浅拷贝
  } else {
    return res // 子不存在直接返回父
  }
}

ASSET_TYPES.forEach(function (type) {
  strats[type + 's'] = mergeAssets
})

/**
 * Watchers.
 *
 * Watchers hashes should not overwrite one
 * another, so we merge them as arrays.
 * 观察者散列不应该互相覆盖，所以我们将它们合并为数组。
 */
strats.watch = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  // work around Firefox's Object.prototype.watch...
  if (parentVal === nativeWatch) parentVal = undefined
  if (childVal === nativeWatch) childVal = undefined
  /* istanbul ignore if */
  // 不存在子直接返回父的复制 （因为create会挂载到__proto__原型链上）
  if (!childVal) return Object.create(parentVal || null)
  if (process.env.NODE_ENV !== 'production') {
    assertObjectType(key, childVal, vm) // 检验真对象[Object Object]
  }
  if (!parentVal) return childVal // 没有父返回子
  const ret = {}
  extend(ret, parentVal) // 浅拷贝一份父的
  for (const key in childVal) {
    let parent = ret[key]
    const child = childVal[key]
    // 父存在 、转数组
    if (parent && !Array.isArray(parent)) {
      parent = [parent]
    }
    // 和mergeHook一样的处理
    ret[key] = parent
      ? parent.concat(child)
      : Array.isArray(child) ? child : [child]
  }
  return ret
}

/**
 * Other object hashes.
 */
strats.props = // 传入的
strats.methods = // 方法
strats.inject = // 注入
strats.computed = function ( // 计算属性
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  if (childVal && process.env.NODE_ENV !== 'production') {
    assertObjectType(key, childVal, vm) // [Object Object]
  }
  /**
   * 1、无父拿子
   * 2、复制父
   * 3、有子合并
   * 4、返回合并/复制结果
   **/
  if (!parentVal) return childVal
  const ret = Object.create(null)
  extend(ret, parentVal)
  if (childVal) extend(ret, childVal)
  return ret
}
// 供应商
strats.provide = mergeDataOrFn

/**
 * Default strategy.
 * 无子拿父
 * 有子拿子
 */
const defaultStrat = function (parentVal: any, childVal: any): any {
  return childVal === undefined
    ? parentVal
    : childVal
}

/**
 * Validate component names 验证components的名字是否可用
 */
function checkComponents (options: Object) {
  for (const key in options.components) {
    validateComponentName(key)
  }
}
// 真正验证名字的函数
export function validateComponentName (name: string) {
  // 组件名称只能包含字母数字字符和连字符，并且必须以字母开头
  if (!/^[a-zA-Z][\w-]*$/.test(name)) {
    warn(
      'Invalid component name: "' + name + '". Component names ' +
      'can only contain alphanumeric characters and the hyphen, ' +
      'and must start with a letter.'
    )
  }
  // slot,component    || isReservedTag(HTML和SVG标签)
  if (isBuiltInTag(name) || config.isReservedTag(name)) { // 是否保留的标签
    warn(
      'Do not use built-in or reserved HTML elements as component ' +
      'id: ' + name
    )
  }
}

/**
 * Ensure all props option syntax are normalized into the
 * Object-based format.
 * 确保所有props选项语法都规范化为基于对象的格式。
 * 规范化props
 */
function normalizeProps (options: Object, vm: ?Component) {
  const props = options.props
  if (!props) return
  const res = {}
  let i, val, name
  if (Array.isArray(props)) {
    i = props.length
    while (i--) { // 数组循环检验
      val = props[i]
      if (typeof val === 'string') {
        name = camelize(val)
        res[name] = { type: null }
      } else if (process.env.NODE_ENV !== 'production') {
        warn('props must be strings when using array syntax.')
      }
    }
  } else if (isPlainObject(props)) {
    for (const key in props) {
      val = props[key]
      name = camelize(key) // - 转驼峰
      // 不是真obj 就变成真的而且key=type (所以assertProp可以直接写不要判断)
      res[name] = isPlainObject(val)
        ? val
        : { type: val }
    }
  } else if (process.env.NODE_ENV !== 'production') {
    // 不是arr和obj那就错啦
    warn(
      `Invalid value for option "props": expected an Array or an Object, ` +
      `but got ${toRawType(props)}.`,
      vm
    )
  }
  options.props = res // 规范后的结果
}

/**
 * Normalize all injections into Object-based format
 * 将所有注入规范化为基于对象的格式
 */
function normalizeInject (options: Object, vm: ?Component) {
  const inject = options.inject
  if (!inject) return
  const normalized = options.inject = {}
  if (Array.isArray(inject)) { // 将数组改为形如{from:val} 的对象
    for (let i = 0; i < inject.length; i++) {
      normalized[inject[i]] = { from: inject[i] }
    }
  } else if (isPlainObject(inject)) {
    // 对象就枚举 ==> 改变成2个不同的{}形式
    for (const key in inject) {
      const val = inject[key]
      normalized[key] = isPlainObject(val)
        ? extend({ from: key }, val)
        : { from: val }
    }
  } else if (process.env.NODE_ENV !== 'production') {
    // 不是arr和obj那就错啦
    warn(
      `Invalid value for option "inject": expected an Array or an Object, ` +
      `but got ${toRawType(inject)}.`,
      vm
    )
  }
}

/**
 * Normalize raw function directives into object format.
 * 将原始函数指令规范化为对象格式。
 */
function normalizeDirectives (options: Object) {
  const dirs = options.directives
  if (dirs) {
    for (const key in dirs) {
      const def = dirs[key] // 规范化指令的每一项 函数转换为有bind和update的obj
      if (typeof def === 'function') {
        dirs[key] = { bind: def, update: def }
      }
    }
  }
}

// 断言是否真Object [Object Object]
function assertObjectType (name: string, value: any, vm: ?Component) {
  if (!isPlainObject(value)) {
    warn(
      `Invalid value for option "${name}": expected an Object, ` +
      `but got ${toRawType(value)}.`,
      vm
    )
  }
}

/**
 * Merge two option objects into a new one.
 * Core utility used in both instantiation and inheritance.
 * 将两个选项对象合并为一个新对象。用于实例化和继承的核心实用程序。
 * （思考为什么先父后子，合并配置不应该是拿子的么？）
 */
export function mergeOptions (
  parent: Object,
  child: Object,
  vm?: Component
): Object {
  if (process.env.NODE_ENV !== 'production') {
    checkComponents(child) // 开发环境检查
  }

  if (typeof child === 'function') {
    child = child.options // 如果是一个函数拿函数下面的选项？难道是针对类？
  }

  // 标准化 props、inject、directives
  normalizeProps(child, vm)
  normalizeInject(child, vm)
  normalizeDirectives(child)
  const extendsFrom = child.extends
  if (extendsFrom) {
    // 有继承 ==> 递归调用merge （何种情况会使用？）
    parent = mergeOptions(parent, extendsFrom, vm)
  }
  if (child.mixins) {
    // 合并mixin
    for (let i = 0, l = child.mixins.length; i < l; i++) {
      parent = mergeOptions(parent, child.mixins[i], vm)
    }
  }
  const options = {}
  let key
  for (key in parent) {
    mergeField(key)
  }
  for (key in child) {
    // 因为上面已经合并了一次所以枚举子的时候不存在才合并（思考）
    if (!hasOwn(parent, key)) {
      mergeField(key)
    }
  }
  // 合并字段 枚举的key真实调用上面组装的strats[key]函数
  function mergeField (key) {
    const strat = strats[key] || defaultStrat
    options[key] = strat(parent[key], child[key], vm, key)
  }
  return options
}

/**
 * Resolve an asset.
 * This function is used because child instances need access
 * to assets defined in its ancestor chain.
 * 解析有价值的。使用此函数是因为子实例需要访问其祖先链中定义的有用的东西。
 */
export function resolveAsset (
  options: Object,
  type: string,
  id: string,
  warnMissing?: boolean
): any {
  /* istanbul ignore if */
  if (typeof id !== 'string') {
    return
  }
  const assets = options[type]
  // check local registration variations first
  if (hasOwn(assets, id)) return assets[id] // 选择中含有
  const camelizedId = camelize(id) // 转一下驼峰
  if (hasOwn(assets, camelizedId)) return assets[camelizedId] // 再判断
  const PascalCaseId = capitalize(camelizedId) // 驼峰转-
  if (hasOwn(assets, PascalCaseId)) return assets[PascalCaseId] // 再判断
  // fallback to prototype chain
  // 三个都没有报错
  const res = assets[id] || assets[camelizedId] || assets[PascalCaseId]
  if (process.env.NODE_ENV !== 'production' && warnMissing && !res) {
    warn(
      'Failed to resolve ' + type.slice(0, -1) + ': ' + id,
      options
    )
  }
  /** （有点奇怪，理论上三个没有res应该是undefined为啥还要赋值、判断、返回） **/
  return res
}
