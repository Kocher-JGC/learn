import { forEachValue } from '../util'

// Base data struct for store's module, package with some attribute and method
// 存储模块、具有某些属性和方法的包的基本数据结构
export default class Module {
  constructor (rawModule, runtime) {
    this.runtime = runtime
    // Store some children item // 子仓库
    this._children = Object.create(null)
    // Store the origin module object which passed by programmer
    // 当前仓库源
    this._rawModule = rawModule
    const rawState = rawModule.state

    // Store the origin module's state
    this.state = (typeof rawState === 'function' ? rawState() : rawState) || {}
  }

  // 获取当前模的命名空间
  get namespaced () {
    return !!this._rawModule.namespaced
  }

  // 为当前模块添加children
  addChild (key, module) {
    this._children[key] = module
  }

  // 移除模块的children
  removeChild (key) {
    delete this._children[key]
  }

  // 获取模块的children
  getChild (key) {
    return this._children[key]
  }

  /** 更新模块的 
   * 1. 命名空间
   * 2. actions
   * 3. mutations
   * 4. getters
   ***/
  update (rawModule) {
    this._rawModule.namespaced = rawModule.namespaced
    if (rawModule.actions) {
      this._rawModule.actions = rawModule.actions
    }
    if (rawModule.mutations) {
      this._rawModule.mutations = rawModule.mutations
    }
    if (rawModule.getters) {
      this._rawModule.getters = rawModule.getters
    }
  }

  // 利用传入的fn.遍历children运行一遍
  forEachChild (fn) {
    forEachValue(this._children, fn)
  }

  // 利用传入的fn遍历getters运行一遍
  forEachGetter (fn) {
    if (this._rawModule.getters) {
      forEachValue(this._rawModule.getters, fn)
    }
  }

  // 利用传入的fn遍历ations运行一遍
  forEachAction (fn) {
    if (this._rawModule.actions) {
      forEachValue(this._rawModule.actions, fn)
    }
  }

  // 利用传入的fn遍历mutations运行一遍
  forEachMutation (fn) {
    if (this._rawModule.mutations) {
      forEachValue(this._rawModule.mutations, fn)
    }
  }
}
