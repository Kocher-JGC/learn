/* @flow */

import { mergeOptions } from '../util/index'

/** 向options中合并新选项 **/
export function initMixin (Vue: GlobalAPI) {
  Vue.mixin = function (mixin: Object) {
    this.options = mergeOptions(this.options, mixin)
    return this
  }
}
