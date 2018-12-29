/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { defineComputed, proxy } from '../instance/state'
import { extend, mergeOptions, validateComponentName } from '../util/index'

export function initExtend (Vue: GlobalAPI) {
  /**
   * Each instance constructor, including Vue, has a unique
   * cid. This enables us to create wrapped "child
   * constructors" for prototypal inheritance and cache them.
   */
  Vue.cid = 0
  let cid = 1

  /**
   * Class inheritance
   */
  Vue.extend = function (extendOptions: Object): Function {
    extendOptions = extendOptions || {} //需要扩展的选项
    const Super = this // 当前实例
    const SuperId = Super.cid // 实例id
    // 有缓存拿缓存 ==> extendOptions是新传入的什么会有缓存？
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {})
    if (cachedCtors[SuperId]) {
      return cachedCtors[SuperId]
    }

    // 检查component可用性
    const name = extendOptions.name || Super.options.name
    if (process.env.NODE_ENV !== 'production' && name) {
      validateComponentName(name)
    }

    // 实例组件的函数 和new vue调用的一样
    const Sub = function VueComponent (options) {
      this._init(options)
    }
    // 拿到父级的prototype的属性方法
    Sub.prototype = Object.create(Super.prototype)
    Sub.prototype.constructor = Sub // 修改指针
    Sub.cid = cid++ // 记录组件的唯一id
    // 合并父级选项和传入选项 到 当前实例选项
    Sub.options = mergeOptions(
      Super.options,
      extendOptions
    )
    Sub['super'] = Super // 赋予静态属性父级

    // For props and computed properties, we define the proxy getters on
    // the Vue instances at extension time, on the extended prototype. This
    // avoids Object.defineProperty calls for each instance created.
    // 对于props和计算属性，我们在扩展原型上定义扩展时Vue实例上的代理getter。
    // 这样可以避免为每个创建的实例调用object.defineproperty。
    /** 初始化props和计算属性 **/
    if (Sub.options.props) {
      initProps(Sub)
    }
    if (Sub.options.computed) {
      initComputed(Sub)
    }

    /** 挂载父级的静态方法 **/
    // allow further extension/mixin/plugin usage
    Sub.extend = Super.extend
    Sub.mixin = Super.mixin
    Sub.use = Super.use

    // create asset registers, so extended classes
    // can have their private assets too.
    ASSET_TYPES.forEach(function (type) {
      Sub[type] = Super[type]
    })
    // enable recursive self-lookup
    // 启用递归自查找
    if (name) {
      Sub.options.components[name] = Sub
    }

    // keep a reference to the super options at extension time.
    // later at instantiation we can check if Super's options have
    // been updated.
    // 在扩展时保留对父级选项的引用。稍后在实例化时，我们可以检查super的选项是否已更新。
    Sub.superOptions = Super.options
    Sub.extendOptions = extendOptions
    Sub.sealedOptions = extend({}, Sub.options)

    // cache constructor
    cachedCtors[SuperId] = Sub // 缓存
    return Sub
  }
}

function initProps (Comp) {
  const props = Comp.options.props
  for (const key in props) {
    proxy(Comp.prototype, `_props`, key)
  }
}

function initComputed (Comp) {
  const computed = Comp.options.computed
  for (const key in computed) {
    defineComputed(Comp.prototype, key, computed[key])
  }
}
