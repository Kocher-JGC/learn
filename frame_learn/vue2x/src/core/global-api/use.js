/* @flow */

import { toArray } from '../util/index'

/** 使用该方法可以向use上挂载新的插件（如使用vuex和vueRouter）
 * 如果install方法存在使用install挂载
 * 如果插件为func则调用func挂载
 * 最后把插件push到vue._installedPlugins数组中
**/
export function initUse (Vue: GlobalAPI) {
  Vue.use = function (plugin: Function | Object) {
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // additional parameters
    const args = toArray(arguments, 1)
    args.unshift(this)
    if (typeof plugin.install === 'function') {
      plugin.install.apply(plugin, args)
    } else if (typeof plugin === 'function') {
      plugin.apply(null, args)
    }
    installedPlugins.push(plugin)
    return this
  }
}
