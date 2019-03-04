export default function (Vue) {
  const version = Number(Vue.version.split('.')[0])

  if (version >= 2) {
    Vue.mixin({ beforeCreate: vuexInit }) // 2.0以上直接在beforeCreate上混入vuexInit钩子
  } else {
    // override init and inject vuex init procedure
    // for 1.x backwards compatibility.
    // 重写init并注入Vuex init过程以实现1.x向后兼容性。
    const _init = Vue.prototype._init
    Vue.prototype._init = function (options = {}) {
      options.init = options.init
        ? [vuexInit].concat(options.init)
        : vuexInit
      _init.call(this, options)
    }
  }

  /**
   * Vuex init hook, injected into each instances init hooks list.
   * Vuex init hook，注入到每个实例init hooks列表中。
   */

  function vuexInit () {
    const options = this.$options
    // store injection // 储存注入
    if (options.store) {
      this.$store = typeof options.store === 'function'
        ? options.store()
        : options.store
    } else if (options.parent && options.parent.$store) {
      this.$store = options.parent.$store
    }
  }
}
