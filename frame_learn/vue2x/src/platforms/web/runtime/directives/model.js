/**
 * Not type checking this file because flow doesn't like attaching
 * properties to Elements.
 */

import { isTextInputType } from 'web/util/element'
import { looseEqual, looseIndexOf } from 'shared/util'
import { mergeVNodeHook } from 'core/vdom/helpers/index'
import { warn, isIE9, isIE, isEdge } from 'core/util/index'

/* istanbul ignore if */
if (isIE9) { // ie9的处理
  // http://www.matts411.com/post/internet-explorer-9-oninput/
  document.addEventListener('selectionchange', () => {
    const el = document.activeElement
    if (el && el.vmodel) {
      trigger(el, 'input')
    }
  })
}

const directive = {
  inserted (el, binding, vnode, oldVnode) {
    // 指令的inserted钩子 仅对select有效
    if (vnode.tag === 'select') {
      // #6903
      if (oldVnode.elm && !oldVnode.elm._vOptions) {
        mergeVNodeHook(vnode, 'postpatch', () => { //mergeVNodeHook 解决
          directive.componentUpdated(el, binding, vnode)
        })
      } else {
        setSelected(el, binding, vnode.context) // 设置默认值
      }
      el._vOptions = [].map.call(el.options, getValue) // 映射选项拿到opts并且复制
      // 文本框或者input = text
    } else if (vnode.tag === 'textarea' || isTextInputType(el.type)) {
      el._vModifiers = binding.modifiers // 拿到修饰符储存
      // 如果不是lazy 那么就绑定 compositionstart\compositionend 事件 (中文输入的处理,之前说过的)
      if (!binding.modifiers.lazy) {
        el.addEventListener('compositionstart', onCompositionStart)
        el.addEventListener('compositionend', onCompositionEnd)
        // Safari < 10.2 & UIWebView doesn't fire compositionend when
        // switching focus before confirming composition choice
        // this also fixes the issue where some browsers e.g. iOS Chrome
        // fires "change" instead of "input" on autocomplete.
        /** Safari<10.2&uiWebView不会触发合成，在确认合成选择之前切换焦点时，
         * 这也解决了一些浏览器（如iOS Chrome）在自动完成时触发“更改”而不是“输入”的问题。 **/
        el.addEventListener('change', onCompositionEnd) // 解决兼容问题
        /* istanbul ignore if */
        if (isIE9) {
          el.vmodel = true // ie9标志状态
        }
      }
    }
  },

  // 组件更新的钩子
  componentUpdated (el, binding, vnode) {
    if (vnode.tag === 'select') {
      setSelected(el, binding, vnode.context) // 同样设置默认值
      // in case the options rendered by v-for have changed,
      // it's possible that the value is out-of-sync with the rendered options.
      // detect such cases and filter out values that no longer has a matching
      // option in the DOM.
      // 如果v-for呈现的选项已更改，则该值可能与呈现的选项不同步。
      // 检测此类情况并筛选出在dom中不再具有匹配选项的值。
      const prevOptions = el._vOptions // 拿到刚刚存的选项
      const curOptions = el._vOptions = [].map.call(el.options, getValue) // 组装新的选项
      if (curOptions.some((o, i) => !looseEqual(o, prevOptions[i]))) {
        // 如果找到至少一个值的不匹配选项，则触发更改事件
        // trigger change event if
        // no matching option found for at least one value
        const needReset = el.multiple
        // 找不匹配的 ,如果有
          ? binding.value.some(v => hasNoMatchingOption(v, curOptions))
          : binding.value !== binding.oldValue && hasNoMatchingOption(binding.value, curOptions)
        if (needReset) { // 触发change事件
          trigger(el, 'change')
        }
      }
    }
  }
}

function setSelected (el, binding, vm) {
  actuallySetSelected(el, binding, vm) // 设置binding 默认绑定的值
  /* istanbul ignore if */
  if (isIE || isEdge) {
    setTimeout(() => { // ie需要延时的
      actuallySetSelected(el, binding, vm)
    }, 0)
  }
}

// 实际的选项
function actuallySetSelected (el, binding, vm) {
  // 绑定的值和是否多选
  const value = binding.value
  const isMultiple = el.multiple
  if (isMultiple && !Array.isArray(value)) { // 值不是数组而且是多选,肯定出错啦
    process.env.NODE_ENV !== 'production' && warn(
      `<select multiple v-model="${binding.expression}"> ` +
      `expects an Array value for its binding, but got ${
        Object.prototype.toString.call(value).slice(8, -1)
      }`,
      vm
    )
    return
  }
  let selected, option
  // 对选项进行遍历 改变其值
  for (let i = 0, l = el.options.length; i < l; i++) {
    option = el.options[i]
    if (isMultiple) {
      // 检查形态拿到index
      selected = looseIndexOf(value, getValue(option)) > -1
      if (option.selected !== selected) {
        option.selected = selected
      }
    } else {
      // 直接检查形态就行
      if (looseEqual(getValue(option), value)) {
        if (el.selectedIndex !== i) {
          el.selectedIndex = i
        }
        return
      }
    }
  }
  if (!isMultiple) {
    el.selectedIndex = -1 //选不到了
  }
}

// 无匹配选项
function hasNoMatchingOption (value, options) {
  return options.every(o => !looseEqual(o, value))
}

// 获取值
function getValue (option) {
  return '_value' in option
    ? option._value
    : option.value
}

// 输入中文记录的状态(开始状态)
function onCompositionStart (e) {
  e.target.composing = true
}

// 切换到结束状态不输入,并标志状态主动触发input事件
function onCompositionEnd (e) {
  // prevent triggering an input event for no reason
  // 防止无故触发输入事件
  if (!e.target.composing) return
  e.target.composing = false
  trigger(e.target, 'input')
}

// 用于触发原生的HTML事件
function trigger (el, type) {
  const e = document.createEvent('HTMLEvents')
  e.initEvent(type, true, true)
  el.dispatchEvent(e)
}

export default directive
