/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

/** 数据访问的代理 如 访问 this.msg 实际上是访问this._data.msg **/
export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}
/** 初始化各种数据代理值得注意的是如果data没有那么检测一个空对象 **/
export function initState (vm: Component) {
  vm._watchers = []
  const opts = vm.$options
  if (opts.props) initProps(vm, opts.props)
  if (opts.methods) initMethods(vm, opts.methods)
  if (opts.data) {
    initData(vm)
  } else {
    observe(vm._data = {}, true /* asRootData */)
  }
  if (opts.computed) initComputed(vm, opts.computed)
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

function initProps (vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {}
  const props = vm._props = {}
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  // 缓存porp键，以便将来porp的属性更新可以使用数组而不是动态对象键枚举进行迭代。
  const keys = vm.$options._propKeys = []
  const isRoot = !vm.$parent
  // root instance props should be converted
  // 根实例的props可能需要转换（修改）
  if (!isRoot) {
    toggleObserving(false)
  }
  // 枚举propsOptions 验证prop的
  for (const key in propsOptions) {
    keys.push(key)
    const value = validateProp(key, propsOptions, propsData, vm)
    // 设置props观测变化的语法糖 并且代理访问 this.msg = this._props.msg
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      // 开发环境先判断是不是关键字 再设置语法糖
      const hyphenatedKey = hyphenate(key) // 转换一下名字 aA => a-a
      // 判断 key,ref,slot,slot-scope,is,style,class 关键字
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      defineReactive(props, key, value, () => {
        if (vm.$parent && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    // 在Vue.extend（）期间，静态属性已经被代理到组件的原型上。
    // 我们只需要代理在这里实例化时定义的props。
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  toggleObserving(true) // 开启观测
}

function initData (vm: Component) {
  // 生成实例的data并引用至vm._data
  let data = vm.$options.data
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}
  // 如果不是纯对象
  if (!isPlainObject(data)) { // [Object Object]
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // proxy data on instance // 在实例中代理数据
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  // 拿到 props 和 methods 检查 key 是否存在他们的key中
  // 如果props 没有定义该key而且 不是 key,ref,slot,slot-scope,is
  // 成立后就代理 key 对应的data
  while (i--) {
    const key = keys[i]
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {
      proxy(vm, `_data`, key)
    }
  }
  // observe data
  observe(data, true /* asRootData */)
}

export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  // 调用数据获取程序时禁用DEP收集(#7573)
  pushTarget()
  try {
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget() // 刚才禁用了现在开启？
  }
}

const computedWatcherOptions = { computed: true }

function initComputed (vm: Component, computed: Object) {
  // $flow-disable-line
  const watchers = vm._computedWatchers = Object.create(null)
  // computed properties are just getters during SSR // 计算属性只是SSR期间的getter
  const isSSR = isServerRendering() // 是否服务端渲染

  for (const key in computed) {
    const userDef = computed[key]
    // 因为computed可以设置func或者get/set
    const getter = typeof userDef === 'function' ? userDef : userDef.get
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    if (!isSSR) { // 不是服务端渲染
      // create internal watcher for the computed property.
      // 为计算属性创建内部观察程序。
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    // 组件定义的计算属性已经在组件原型上定义。我们只需要在这里定义在实例化时定义的计算属性。
    if (!(key in vm)) {
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}

export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  const shouldCache = !isServerRendering() // 不是服务端渲染能够缓存
  /**
   * 1、缓存 调用 createComputedGetter 进行缓存和返回值
   * 2、不能缓存 直接是传入的是怎样调用就怎样调用
   * 3、纯函数只有get  而 不是存函数 有 get 、 set
   *  **/
  if (typeof userDef === 'function') {
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : userDef
    sharedPropertyDefinition.set = noop
  } else {
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : userDef.get
      : noop
    sharedPropertyDefinition.set = userDef.set
      ? userDef.set
      : noop
  }
  // 开发环境下 set 是一个空函数，但执行set会报警告
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  // 将组装好的obj定义defineProperty
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

/** 存在_computedWatchers的缓存
 * _computedWatchers 在initComputed 创建 在new watcher中赋值 **/
function createComputedGetter (key) {
  return function computedGetter () {
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) { // 依赖收集和返回值
      watcher.depend()
      return watcher.evaluate()
    }
  }
}

/** 所以如果生产环境下只做了修改this指针和赋值 **/
function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props // 因为初始化的顺序 props 在 methods 所以要检查props是否也定义了
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      if (methods[key] == null) { // 方法对应的key传了null
        warn(
          `Method "${key}" has an undefined value in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      if (props && hasOwn(props, key)) { // props 也定义了该key 的属性/方法
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      if ((key in vm) && isReserved(key)) { // vm 实例上有该key对应的属性而且key是 class或style
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    // 绑定方法 修改this
    vm[key] = methods[key] == null ? noop : bind(methods[key], vm)
  }
}

/** 铺平一层watch调用createWatcher创建 **/
function initWatch (vm: Component, watch: Object) {
  for (const key in watch) { // 枚举 支持单个/数组
    const handler = watch[key]
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

/** 实际调用的是vm.$watcher **/
function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  if (isPlainObject(handler)) { // [Object Object]
    options = handler
    handler = handler.handler
  }
  // string 直接拿 vm实例上的
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  // 在使用object.defineproperty时，流在某种程度上与直接声明的定义对象存在问题，
  // 因此我们必须在此处按程序构建对象。
  const dataDef = {}
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function (newData: Object) {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  // 响应式数据 $data 和 $props
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  // 混入 sel和del方法
  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  // 混入 $watch
  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this
    if (isPlainObject(cb)) { // 判断如果是[Object Object] 调用createWatcher 修改cb再创建
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    options.user = true // 设置这个属性用处？
    // 真正实例watcher
    const watcher = new Watcher(vm, expOrFn, cb, options)
    if (options.immediate) { // 是否立刻执行
      cb.call(vm, watcher.value)
    }
    return function unwatchFn () {
      watcher.teardown() // 返回销毁的函数
    }
  }
}
