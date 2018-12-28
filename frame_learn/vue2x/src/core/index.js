import Vue from './instance/index'
import { initGlobalAPI } from './global-api/index'
import { isServerRendering } from 'core/util/env'
import { FunctionalRenderContext } from 'core/vdom/create-functional-component'

/** 在混入_init、数据中心、事件中心、生命周期、渲染函数后
 *  初始化全局API initGlobalAPI
**/
initGlobalAPI(Vue)
/** 初始化默认的配置
 *  Vue挂载全局工具util（warn,extend,mergeOptions,defineReactive）
 *  Vue挂载set、delete、nextTick、options、_base、options.components
 *  init 挂载use方法 、 挂载mixin方法、 挂载Extend方法、 挂载AssetRegisters方法
 *  **/

/** 挂载 $isServer 和$ssrContext 属性 **/
Object.defineProperty(Vue.prototype, '$isServer', {
  get: isServerRendering
})

Object.defineProperty(Vue.prototype, '$ssrContext', {
  get () {
    /* istanbul ignore next */
    return this.$vnode && this.$vnode.ssrContext
  }
})

// expose FunctionalRenderContext for ssr runtime helper installation
// 为ssr运行时帮助程序安装公开FunctionalRenderContext
Object.defineProperty(Vue, 'FunctionalRenderContext', {
  value: FunctionalRenderContext
})

Vue.version = '__VERSION__'

export default Vue
