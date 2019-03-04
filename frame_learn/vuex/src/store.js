import applyMixin from './mixin'
import devtoolPlugin from './plugins/devtool'
import ModuleCollection from './module/module-collection'
import { forEachValue, isObject, isPromise, assert } from './util'

let Vue // bind on install

export class Store {
  constructor (options = {}) {
    // Auto install if it is not done yet and `window` has `Vue`.
    // To allow users to avoid auto-installation in some cases,
    // this code should be placed here. See #731
    // 如果尚未完成，并且“window”具有“vue”，则自动安装。为了让用户在某些情况下避免自动安装，应该将此代码放在这里。
    if (!Vue && typeof window !== 'undefined' && window.Vue) {
      install(window.Vue)
    }

    // 对使用的断言,(Vue\Promise\并且是通过new 调用的)
    if (process.env.NODE_ENV !== 'production') {
      assert(Vue, `must call Vue.use(Vuex) before creating a store instance.`)
      assert(typeof Promise !== 'undefined', `vuex requires a Promise polyfill in this browser.`)
      assert(this instanceof Store, `store must be called with the new operator.`)
    }

    const {
      plugins = [],
      strict = false
    } = options

    // store internal state // 存储内部状态 (定义一些内部使用的变量)
    this._committing = false
    this._actions = Object.create(null)
    this._actionSubscribers = []
    this._mutations = Object.create(null)
    this._wrappedGetters = Object.create(null)
    this._modules = new ModuleCollection(options)
    this._modulesNamespaceMap = Object.create(null)
    this._subscribers = []
    this._watcherVM = new Vue()

    // bind commit and dispatch to self // 将提交和分派绑定到自己
    const store = this
    // dispatch和commit 函数包装一层
    const { dispatch, commit } = this
    this.dispatch = function boundDispatch (type, payload) {
      return dispatch.call(store, type, payload)
    }
    this.commit = function boundCommit (type, payload, options) {
      return commit.call(store, type, payload, options)
    }

    // strict mode // 严格模式
    this.strict = strict

    // 获取module中的对应的仓库
    const state = this._modules.root.state

    // init root module.
    // this also recursively registers all sub-modules
    // and collects all module getters inside this._wrappedGetters
    // init根模块。这还递归地注册所有子模块并收集其中的所有模块getter。
    installModule(this, state, [], this._modules.root)

    // initialize the store vm, which is responsible for the reactivity // 初始化负责响应式的存储vm
    // (also registers _wrappedGetters as computed properties)
    // （也将包装纸注册为计算属性）
    resetStoreVM(this, state)

    // apply plugins // 应用插件
    plugins.forEach(plugin => plugin(this))

    // 对浏览器插件的使用
    const useDevtools = options.devtools !== undefined ? options.devtools : Vue.config.devtools
    if (useDevtools) {
      devtoolPlugin(this)
    }
  }

  // 获取当前实例的数据中心
  get state () {
    return this._vm._data.$$state
  }

  // 而数据中心不能动态设置
  set state (v) {
    if (process.env.NODE_ENV !== 'production') {
      assert(false, `use store.replaceState() to explicit replace store state.`)
    }
  }

  commit (_type, _payload, _options) {
    // check object-style commit // 检查对象样式提交
    const {
      type,
      payload,
      options
    } = unifyObjectStyle(_type, _payload, _options)

    const mutation = { type, payload }
    const entry = this._mutations[type] // 获取type对应的mutations
    if (!entry) {
      if (process.env.NODE_ENV !== 'production') {
        console.error(`[vuex] unknown mutation type: ${type}`)
      }
      return
    }
    // 
    this._withCommit(() => {
      entry.forEach(function commitIterator (handler) {
        handler(payload)
      })
    })
    // 
    this._subscribers.forEach(sub => sub(mutation, this.state))

    if (
      process.env.NODE_ENV !== 'production' &&
      options && options.silent
    ) {
      console.warn(
        `[vuex] mutation type: ${type}. Silent option has been removed. ` +
        'Use the filter functionality in the vue-devtools'
      )
    }
  }

  dispatch (_type, _payload) {
    // check object-style dispatch // 检查对象风格的dispatch
    const {
      type,
      payload
    } = unifyObjectStyle(_type, _payload)

    const action = { type, payload }
    const entry = this._actions[type] //在actions.中获取type对应的
    if (!entry) {
      if (process.env.NODE_ENV !== 'production') {
        console.error(`[vuex] unknown action type: ${type}`)
      }
      return
    }

    try {
      // 先对action列表过滤,然后在枚举调用before
      this._actionSubscribers
        .filter(sub => sub.before)
        .forEach(sub => sub.before(action, this.state))
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[vuex] error in before action subscribers: `)
        console.error(e)
      }
    }

    // 对当前的action(entry)进行调用  --> 实际调用注册action时候传入的handler --> 所有就是调用我们用户传入的action里面的方法
    const result = entry.length > 1
      ? Promise.all(entry.map(handler => handler(payload)))
      : entry[0](payload)

    // 返回一个可以catch和接着then的promise 并在then中又进行了过滤和调用_actionSubscribers中的action ?疑惑
    return result.then(res => {
      try {
        this._actionSubscribers
          .filter(sub => sub.after)
          .forEach(sub => sub.after(action, this.state))
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[vuex] error in after action subscribers: `)
          console.error(e)
        }
      }
      return res
    })
  }

  // 监听/订阅 某个函数
  subscribe (fn) {
    return genericSubscribe(fn, this._subscribers)
  }

  // 监听/订阅某个action函数
  subscribeAction (fn) {
    const subs = typeof fn === 'function' ? { before: fn } : fn
    return genericSubscribe(subs, this._actionSubscribers)
  }

  // 观察getter的变化
  watch (getter, cb, options) {
    if (process.env.NODE_ENV !== 'production') {
      assert(typeof getter === 'function', `store.watch only accepts a function.`)
    }
    return this._watcherVM.$watch(() => getter(this.state, this.getters), cb, options)
  }

  // 替换新的state
  replaceState (state) {
    this._withCommit(() => {
      this._vm._data.$$state = state
    })
  }

  //注册一个module
  registerModule (path, rawModule, options = {}) {
    if (typeof path === 'string') path = [path] //参数处理

    if (process.env.NODE_ENV !== 'production') {
      assert(Array.isArray(path), `module path must be a string or an Array.`)
      assert(path.length > 0, 'cannot register the root module by using registerModule.')
    }

    this._modules.register(path, rawModule) //调用ModuleCollection的注册方法进行注册module
    // 注册完就安装啊
    installModule(this, this.state, path, this._modules.get(path), options.preserveState)
    // reset store to update getters... //重置store用于更新getters
    resetStoreVM(this, this.state)
  }

  unregisterModule (path) {
    if (typeof path === 'string') path = [path]

    if (process.env.NODE_ENV !== 'production') {
      assert(Array.isArray(path), `module path must be a string or an Array.`)
    }

    // 同理调用ModuleCollection,unregister取消注册
    this._modules.unregister(path)
    this._withCommit(() => {
      //  过去嵌套的state,并且调用Vue.delete删除相应的属性
      const parentState = getNestedState(this.state, path.slice(0, -1))
      Vue.delete(parentState, path[path.length - 1])
    })
    resetStore(this) // 最后重置store
  }

  // 利用新的options进行热更新
  hotUpdate (newOptions) {
    this._modules.update(newOptions)
    resetStore(this, true) //热更新也要重置store
  }

  // 修改committing的再执行函数
  _withCommit (fn) {
    const committing = this._committing
    this._committing = true
    fn()
    this._committing = committing
  }
}

// 通用订阅的函数
function genericSubscribe (fn, subs) {
  if (subs.indexOf(fn) < 0) {
    subs.push(fn) //向subs中添加订阅的函数
  }
  return () => { // 返回移除subs的函数方法 (取消订阅)
    const i = subs.indexOf(fn)
    if (i > -1) {
      subs.splice(i, 1)
    }
  }
}

//  重置仓库
function resetStore (store, hot) {
  store._actions = Object.create(null)
  store._mutations = Object.create(null)
  store._wrappedGetters = Object.create(null)
  store._modulesNamespaceMap = Object.create(null)
  const state = store.state
  // init all modules // 初始化所有仓库
  installModule(store, state, [], store._modules.root, true)
  // reset vm // 初始化vm
  resetStoreVM(store, state, hot)
}

function resetStoreVM (store, state, hot) {
  const oldVm = store._vm

  // bind store public getters // 绑定存储公用getter
  store.getters = {}
  const wrappedGetters = store._wrappedGetters
  const computed = {}
  // 枚举wrapperGetters的方法记录computed的(记录运行结果),定义对应key的获取(订义getters)
  forEachValue(wrappedGetters, (fn, key) => {
    // use computed to leverage its lazy-caching mechanism
    // 使用computed来利用其惰性缓存机制
    computed[key] = () => fn(store)
    Object.defineProperty(store.getters, key, {
      get: () => store._vm[key],
      enumerable: true // for local getters
    })
  })

  // use a Vue instance to store the state tree
  // suppress warnings just in case the user has added
  // some funky global mixins
  // 使用Vue实例存储状态树禁止警告，以防用户添加了一些新的变量混淆了全局。
  const silent = Vue.config.silent
  Vue.config.silent = true
  store._vm = new Vue({
    data: {
      $$state: state
    },
    computed
  })
  Vue.config.silent = silent

  // enable strict mode for new vm // 为新vm启用严格模式
  if (store.strict) {
    enableStrictMode(store)
  }

  if (oldVm) {
    if (hot) {
      // 调度所有订阅的观察程序中的更改，以强制getter重新评估热重载。
      // dispatch changes in all subscribed watchers
      // to force getter re-evaluation for hot reloading.
      store._withCommit(() => {
        oldVm._data.$$state = null
      })
    }
    // 并在下一个任务执行旧的vm的销毁
    Vue.nextTick(() => oldVm.$destroy())
  }
}

// 安装module
function installModule (store, rootState, path, module, hot) {
  const isRoot = !path.length
  // 获取path拼接的命名空间
  const namespace = store._modules.getNamespace(path)

  // register in namespace map // 注册对应命名空间的路由映射关系
  if (module.namespaced) {
    store._modulesNamespaceMap[namespace] = module
  }

  // set state // 设置状态(仓库)
  if (!isRoot && !hot) {
    // 先获取父级的再组装name --> 接着调用withCommit
    const parentState = getNestedState(rootState, path.slice(0, -1))
    const moduleName = path[path.length - 1]
    store._withCommit(() => {
      Vue.set(parentState, moduleName, module.state)
    })
  }

  // 生成当前module的上下文
  const local = module.context = makeLocalContext(store, namespace, path)

  // 枚举module下的(mutation\action\getter\child) 并 进行注册
  module.forEachMutation((mutation, key) => {
    const namespacedType = namespace + key
    registerMutation(store, namespacedType, mutation, local)
  })

  module.forEachAction((action, key) => {
    const type = action.root ? key : namespace + key
    const handler = action.handler || action
    registerAction(store, type, handler, local)
  })

  module.forEachGetter((getter, key) => {
    const namespacedType = namespace + key
    registerGetter(store, namespacedType, getter, local)
  })

  module.forEachChild((child, key) => {
    installModule(store, rootState, path.concat(key), child, hot)
  })
}

/**
 * make localized dispatch, commit, getters and state
 * if there is no namespace, just use root ones
 * 进行本地化的dispatch、commit、getters和state
 * 如果没有命名空间，只使用根命名空间。
 * (生成module的上下文)
 */
function makeLocalContext (store, namespace, path) {
  const noNamespace = namespace === ''

  const local = {
    // 拿根的或者解析出type 和 payload 调用 store.dispatch进行获取
    dispatch: noNamespace ? store.dispatch : (_type, _payload, _options) => {
      const args = unifyObjectStyle(_type, _payload, _options)
      const { payload, options } = args
      let { type } = args

      if (!options || !options.root) {
        type = namespace + type
        if (process.env.NODE_ENV !== 'production' && !store._actions[type]) {
          console.error(`[vuex] unknown local action type: ${args.type}, global type: ${type}`)
          return
        }
      }

      return store.dispatch(type, payload)
    },

    // 拿根的或者解析出type\payload\options 调用store.commit进行获取
    commit: noNamespace ? store.commit : (_type, _payload, _options) => {
      const args = unifyObjectStyle(_type, _payload, _options)
      const { payload, options } = args
      let { type } = args

      if (!options || !options.root) {
        type = namespace + type
        if (process.env.NODE_ENV !== 'production' && !store._mutations[type]) {
          console.error(`[vuex] unknown local mutation type: ${args.type}, global type: ${type}`)
          return
        }
      }

      store.commit(type, payload, options)
    }
  }

  // getters and state object must be gotten lazily
  // because they will be changed by vm update
  // 必须延迟获取getter和state对象，因为它们将被vm更新更改。
  Object.defineProperties(local, {
    getters: {
      get: noNamespace
        ? () => store.getters
        : () => makeLocalGetters(store, namespace)
    },
    state: {
      get: () => getNestedState(store.state, path)
    }
  })

  return local // 返回生成的local (有dispatch和commit2个方法)
}

// 生成本地getters
function makeLocalGetters (store, namespace) {
  const gettersProxy = {}

  const splitPos = namespace.length // 获取命名空间的
  Object.keys(store.getters).forEach(type => {
    // skip if the target getter is not match this namespace
    // 如果目标getter与此命名空间不匹配，则跳过
    if (type.slice(0, splitPos) !== namespace) return

    // extract local getter type // 提取本地getter的类型
    const localType = type.slice(splitPos)

    // Add a port to the getters proxy.
    // Define as getter property because
    // we do not want to evaluate the getters in this time.
    // 向getters代理添加端口。定义为getter属性，因为我们不希望在此时评估getter。
    Object.defineProperty(gettersProxy, localType, {
      get: () => store.getters[type],
      enumerable: true
    })
  })

  return gettersProxy // 返回getters代理的对象
}

// 实际上是向store._mutations数组添加(一个函数)
function registerMutation (store, type, handler, local) {
  const entry = store._mutations[type] || (store._mutations[type] = [])
  // 该函数的运行调用的是传入的handler
  // 运行的时候修改指针为store ,并且传入local.state和payload参数
  entry.push(function wrappedMutationHandler (payload) {
    handler.call(store, local.state, payload)
  })
}

// 实际上是对store._actions数组的添加 (添加的是一个函数)
function registerAction (store, type, handler, local) {
  const entry = store._actions[type] || (store._actions[type] = [])
  entry.push(function wrappedActionHandler (payload, cb) {
    // 该函数的返回结果是传入的handler的运行结果,并且运行handler的时候,
    // 把指针修改为store,传入{dispatch\commit\getters\state\rootGetters\rootState] 对象进行运行
    let res = handler.call(store, {
      dispatch: local.dispatch,
      commit: local.commit,
      getters: local.getters,
      state: local.state,
      rootGetters: store.getters,
      rootState: store.state
    }, payload, cb)
    if (!isPromise(res)) {
      res = Promise.resolve(res) //对promise的处理
    }
    if (store._devtoolHook) {
      return res.catch(err => {
        store._devtoolHook.emit('vuex:error', err)
        throw err
      })
    } else {
      return res
    }
  })
}

//  传入local和store的state和getters 调用 rawGetters 拿到结果的方法,就是getters的方法 (有点绕的注册不知道怎么表达)
function registerGetter (store, type, rawGetter, local) {
  if (store._wrappedGetters[type]) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[vuex] duplicate getter key: ${type}`)
    }
    return
  }
  store._wrappedGetters[type] = function wrappedGetter (store) {
    return rawGetter(
      local.state, // local state
      local.getters, // local getters
      store.state, // root state
      store.getters // root getters
    )
  }
}

// 开启严格模式
function enableStrictMode (store) {
  store._vm.$watch(function () { return this._data.$$state }, () => {
    if (process.env.NODE_ENV !== 'production') {
      assert(store._committing, `do not mutate vuex store state outside mutation handlers.`)
    }
  }, { deep: true, sync: true })
}

// 获取嵌套的状态
function getNestedState (state, path) {
  return path.length // 没路径直接拿state ,有路径拿到路径最后一层对应的state
    ? path.reduce((state, key) => state[key], state)
    : state
}

// 其实就是解析type 和进行对数据key的标准化处理
function unifyObjectStyle (type, payload, options) {
  if (isObject(type) && type.type) {
    options = payload
    payload = type
    type = type.type
  }

  if (process.env.NODE_ENV !== 'production') {
    assert(typeof type === 'string', `expects string as the type, but found ${typeof type}.`)
  }

  return { type, payload, options }
}

// vuex的安装方法实际上调用的是applyMixin
export function install (_Vue) {
  if (Vue && _Vue === Vue) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(
        '[vuex] already installed. Vue.use(Vuex) should be called only once.'
      )
    }
    return
  }
  Vue = _Vue
  applyMixin(Vue)
}
