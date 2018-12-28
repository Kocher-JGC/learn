import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

function Vue (options) {
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  this._init(options) // new Vue 就做了这件事情
}

/** 注意都是向prototype中混入 **/
initMixin(Vue) // 向Vue混入_init方法
stateMixin(Vue) // 混入数据中心、向Vue混入$data,$props,$set,$delete,$watch
eventsMixin(Vue) // 混入事件中心,向Vue混入$on,$once,$off,$emit
lifecycleMixin(Vue) // 混入生命周期，向Vue混入，_update,$forceUpadate,$destroy
renderMixin(Vue) // 混入渲染的操作函数，向Vue混入，$nextTick,_render,并且安装渲染助手
/** 渲染helpers有以下方法
 *  _o
 *  _n
 *  _s
 *  _l
 *  _t
 *  _q
 *  _i
 *  _m
 *  _f
 *  _k
 *  _b
 *  _v
 *  _e
 *  _u
 *  _g
 **/

export default Vue
