/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 * 在某些情况下，我们可能希望在组件的更新计算中禁用观察。
 */
export let shouldObserve: boolean = true
// 开启或者禁言观察者
export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 * 附加到每个被观察对象的观察者类。
 * 一旦连接，观察者就将目标对象的属性键转换为收集依赖项和调度更新的getter/setter。
 */
export class Observer {
  value: any;
  dep: Dep;
  // 将此对象作为根$data的vm计数
  vmCount: number; // number of vms that has this object as root $data

  constructor (value: any) {
    this.value = value
    this.dep = new Dep()
    this.vmCount = 0
    def(value, '__ob__', this) // 观察this的变化key是__ob__
    if (Array.isArray(value)) {
      /** 考虑得很周到使用原型链的方法进行拦截还是新定义方法进行拦截 **/
      // 但是有点疑问不是很懂
      const augment = hasProto
        ? protoAugment
        : copyAugment
      augment(value, arrayMethods, arrayKeys)
      this.observeArray(value) // 循环定义观察者
    } else {
      this.walk(value)
    }
  }

  /**
   * Walk through each property and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   * 遍历每个属性并将其转换为getter/setter。仅当值类型为“对象”时才应调用此方法。
   */
  walk (obj: Object) { // 调用defineReactive为每个可以枚举的属性定义getter和setter语法糖
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   * 循环数组调用observe进行对未观察且可以观察的对象定义观察者
   * 所以最后还是会回到walk进行defineReactive进行订阅
   */
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment an target Object or Array by intercepting
 * the prototype chain using __proto__
 * 通过使用__proto__拦截原型链来增强目标obj/arr
 */
function protoAugment (target, src: Object, keys: any) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment an target Object or Array by defining
 * hidden properties.
 * 通过定义隐藏属性来扩充目标obj或arr。
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 * 尝试为一个值创建一个观察者实例，如果观察成功，则返回新的观察者，如果该值已有，则返回现有的观察者。
 */
export function observe (value: any, asRootData: ?boolean): Observer | void {
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void
  // 有观察者，返回。 无创建。
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    shouldObserve && // 可以开启观察
    !isServerRendering() && // 不是服务端渲染
    (Array.isArray(value) || isPlainObject(value)) && // [Object Array/Object]
    Object.isExtensible(value) && // 而且该对象可以扩展
    !value._isVue // 而且不是Vue本身
  ) {
    ob = new Observer(value) //新建观察者
  }
  if (asRootData && ob) {
    ob.vmCount++ // 实例一个计数+1
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 * 在对象上定义一个反应性属性。
 * 数据相应的核心，语法糖的定义
 * 思考： 都是添加dep在哪里删除dep
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  const dep = new Dep()

  //回指定对象上一个自有属性对应的属性描述符。(value,writable,get,set,configurable,enumerable)
  const property = Object.getOwnPropertyDescriptor(obj, key)
  //configurable当且仅当指定对象的属性描述可以被改变或者属性可被删除时，为true。
  if (property && property.configurable === false) { // 属性不可以被改变就没必要设置语法糖
    return
  }

  // cater for pre-defined getter/setters
  const getter = property && property.get
  const setter = property && property.set
  // 没有getter或者有setter 而且只有2个参数手动给val
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  // 浅监听、定义观察者
  let childOb = !shallow && observe(val)
  // 定义语法糖
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      // 当前属性自带get先调用没有直接赋值
      const value = getter ? getter.call(obj) : val
      if (Dep.target) { // 当前观察存在才更继续没有观察者也没有意义
        dep.depend() // 添加当前定义属性的dep对象（巧妙利用了作用域）
        if (childOb) { // 成功定义了观察者
          childOb.dep.depend() // 把订阅的观察者的dep也添加进去（好奇怪为什么要这么绕）
          if (Array.isArray(value)) {
            dependArray(value) // array单独处理
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      const value = getter ? getter.call(obj) : val // 还是有get先调用
      /* eslint-disable no-self-compare */
      // 判断值的改变 （可是自身不等于自身有点难理解）
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter() // 开发环境下调用这个是啥？
      }
      //原先有set调用没有直接赋值
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      // 拿到或者新设置一个观察者
      childOb = !shallow && observe(newVal)
      dep.notify() // 主动更新
    }
  })
}

/** target 都是any **/

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 * 在对象上设置属性。如果属性不存在，则添加新属性并触发更改通知。
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target)) // 如果是未定义或者是普通对象那么就报警告
  ) {
    //target : any
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${target}`)
  }
  // 是一个数组而且key可用
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    // 修改长度删除key对应项替换为val
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  // key是对象上的而且不是原型上的可以赋值
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = target.__ob__
  // 如果对象是一个观察者而且有$data或者是Vue那么直接返回val
  // (ob && ob.vmCount)不是很理解这个判断？？
  if (target._isVue || (ob && ob.vmCount)) {
    //避免在运行时向Vue实例或其根$data添加反应性属性-在data选项中预先声明它
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  // 如果没有观察者那么设置值返回值
  if (!ob) {
    target[key] = val
    return val
  }
  // 定义观察者
  defineReactive(ob.value, key, val)
  ob.dep.notify() // 最后主动更新
  return val
}

/**
 * Delete a property and trigger change if necessary.
 * 删除属性并在必要时触发更改。
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target)) // 如果是未定义或者是普通对象那么就报警告
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${target}`)
  }
  // 是一个数组而且key可用 那就调用splice删除
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = target.__ob__
  if (target._isVue || (ob && ob.vmCount)) { // 和set一样的检测
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) {
    return // 对象上没有该属性
  }
  delete target[key] //删除属性
  if (!ob) { // 该对象没有被观察
    return
  }
  ob.dep.notify() // 主动更新
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 * 在触摸数组时收集数组元素的依赖项，因为我们不能像属性getter那样拦截数组元素访问。
 * （对数组访问的特殊处理）
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend() // 是一个观察者又把其dep添加
    if (Array.isArray(e)) { // 是个数组递归添加（有点像链式子父）
      dependArray(e)
    }
  }
}
