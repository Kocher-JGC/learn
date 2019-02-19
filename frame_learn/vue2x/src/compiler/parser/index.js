/* @flow */

import he from 'he'
import { parseHTML } from './html-parser'
import { parseText } from './text-parser'
import { parseFilters } from './filter-parser'
import { genAssignmentCode } from '../directives/model'
import { extend, cached, no, camelize } from 'shared/util'
import { isIE, isEdge, isServerRendering } from 'core/util/env'

import {
  addProp,
  addAttr,
  baseWarn,
  addHandler,
  addDirective,
  getBindingAttr,
  getAndRemoveAttr,
  pluckModuleFunction
} from '../helpers'

export const onRE = /^@|^v-on:/ /** 绑定事件的正则*/ 
export const dirRE = /^v-|^@|^:/ /** 指令的正则 */ 
export const forAliasRE = /([^]*?)\s+(?:in|of)\s+([^]*)/ /** for(in/of)的正则 */
export const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/ /**  匹配最后2或1个逗号后面的内容（0结果含逗号）*/
const stripParensRE = /^\(|\)$/g /** 匹配括号的正则*/

const argRE = /:(.*)$/
export const bindRE = /^:|^v-bind:/ /** 绑定属性的正则*/
const modifierRE = /\.[^.]+/g /** 修饰符的正则*/

const decodeHTMLCached = cached(he.decode) /** 缓存HTML的译码 */

// configurable state
export let warn: any
let delimiters
let transforms
let preTransforms
let postTransforms
let platformIsPreTag
let platformMustUseProp
let platformGetTagNamespace

type Attr = { name: string; value: string };
/** 创建ast节点的函数 */
export function createASTElement (
  tag: string,
  attrs: Array<Attr>,
  parent: ASTElement | void
): ASTElement {
  return {
    type: 1,
    tag,
    attrsList: attrs,
    attrsMap: makeAttrsMap(attrs),
    parent,
    children: []
  }
}

/**
 * Convert HTML string to AST.
 * 将html转化为ast节点的函数
 */
export function parse (
  template: string,
  options: CompilerOptions
): ASTElement | void {
  // 对options的处理
  warn = options.warn || baseWarn

  platformIsPreTag = options.isPreTag || no
  platformMustUseProp = options.mustUseProp || no
  platformGetTagNamespace = options.getTagNamespace || no

  // 对选项的模块进行处理（这三个包含平台相关的什么？？）
  transforms = pluckModuleFunction(options.modules, 'transformNode')
  preTransforms = pluckModuleFunction(options.modules, 'preTransformNode')
  postTransforms = pluckModuleFunction(options.modules, 'postTransformNode')

  delimiters = options.delimiters // 分隔符

  const stack = []
  const preserveWhitespace = options.preserveWhitespace !== false // 是否保留空白字符
  let root
  let currentParent
  let inVPre = false
  let inPre = false
  let warned = false

  // 错误处理的
  function warnOnce (msg) {
    if (!warned) {
      warned = true
      warn(msg)
    }
  }
  // 标签闭合处理的函数
  function closeElement (element) {
    // check pre state // 两个都是检查preTag
    if (element.pre) {
      inVPre = false
    }
    if (platformIsPreTag(element.tag)) {
      inPre = false
    }
    // apply post-transforms
    for (let i = 0; i < postTransforms.length; i++) {
      postTransforms[i](element, options) // 调用平台相关的model处理函数对选项模块进行处理
    }
  }


  // 解析template模板真正的函数
  parseHTML(template, {
    warn, // 错误处理
    expectHTML: options.expectHTML, // 预期的HTML
    isUnaryTag: options.isUnaryTag, // 是否是一元标签
    canBeLeftOpenTag: options.canBeLeftOpenTag, // 能够是左开标签
    shouldDecodeNewlines: options.shouldDecodeNewlines,// 解决ie兼容
    shouldDecodeNewlinesForHref: options.shouldDecodeNewlinesForHref, // 解决chrome  a[href]
    shouldKeepComment: options.comments, // 是否保留注释节点
    start (tag, attrs, unary) { // 匹配标签开始处理的函数
      // check namespace. 检查命名空间
      // inherit parent ns if there is one 继承父级的命名空间
      const ns = (currentParent && currentParent.ns) || platformGetTagNamespace(tag)

      // handle IE svg bug
      /* istanbul ignore if */
      if (isIE && ns === 'svg') {
        attrs = guardIESVGBug(attrs) // 处理ie SVG的 bug
      }

      // 创建一个一开始的astElement
      let element: ASTElement = createASTElement(tag, attrs, currentParent)
      if (ns) {
        element.ns = ns //设置命名空间
      }

      // 如果是禁止标签（script、style）而且不是服务端渲染，警告和添加forbidden属性
      if (isForbiddenTag(element) && !isServerRendering()) {
        element.forbidden = true
        process.env.NODE_ENV !== 'production' && warn(
          'Templates should only be responsible for mapping the state to the ' +
          'UI. Avoid placing tags with side-effects in your templates, such as ' +
          `<${tag}>` + ', as they will not be parsed.'
        )
      }

      // apply pre-transforms // 同样调用平台相关的model
      for (let i = 0; i < preTransforms.length; i++) {
        element = preTransforms[i](element, options) || element
      }

      // 对pre指令或者标签的处理
      if (!inVPre) {
        processPre(element)
        if (element.pre) {
          inVPre = true
        }
      }
      if (platformIsPreTag(element.tag)) {
        inPre = true
      }
      if (inVPre) { // pre属性为true的时候直接从attrsList生成attrs
        processRawAttrs(element)
        // processed（该element是否已经进行过加工）
      } else if (!element.processed) {
        // structural directives 结构指令的处理(v-for、v-if、v-once)
        processFor(element)
        processIf(element)
        processOnce(element)
        // element-scope stuff 最后再处理元素
        processElement(element, options)
      }

      function checkRootConstraints (el) { // 检查root容器
        if (process.env.NODE_ENV !== 'production') {
          if (el.tag === 'slot' || el.tag === 'template') {
            warnOnce(
              `Cannot use <${el.tag}> as component root element because it may ` +
              'contain multiple nodes.'
            )
          }
          if (el.attrsMap.hasOwnProperty('v-for')) {
            warnOnce(
              'Cannot use v-for on stateful component root element because ' +
              'it renders multiple elements.'
            )
          }
        }
      }

      // tree management
      if (!root) {
        root = element // 第一次，设置根节点
        checkRootConstraints(root)
      } else if (!stack.length) { // 为什么要栈当中无元素(如果是这样应该是根的第一个children)
        // allow root elements with v-if, v-else-if and v-else
        // 允许根元素带有v-if、v-else-if和v-else
        if (root.if && (element.elseif || element.else)) {
          checkRootConstraints(element)
          // 看到这里就懂了，就是有2个或以上的根
          addIfCondition(root, {
            exp: element.elseif,
            block: element
          })
          // 如果不是有if判断的情况那么就是多个根，报错
        } else if (process.env.NODE_ENV !== 'production') {
          warnOnce(
            `Component template should contain exactly one root element. ` +
            `If you are using v-if on multiple elements, ` +
            `use v-else-if to chain them instead.`
          )
        }
      }
      /** 建立父子关系 */
      if (currentParent && !element.forbidden) {
        if (element.elseif || element.else) { // elseif、else处理
          processIfConditions(element, currentParent)
        } else if (element.slotScope) { // scoped slot 作用域槽
          currentParent.plain = false
          const name = element.slotTarget || '"default"'
          ;(currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element
        } else {
          // 父子树的建立（AST）
          currentParent.children.push(element)
          element.parent = currentParent
        }
      }
      if (!unary) { // 非一元标签
        currentParent = element
        stack.push(element) // 形成栈用于后续 end的处理（对元素进行出栈、校验、形成DOM树）
      } else {
        closeElement(element) // 一元标签直接闭合（img、br等）
      }
    },

    end () { // 匹配标签结束处理的函数
      // remove trailing whitespace 删除尾随空格
      const element = stack[stack.length - 1]
      const lastNode = element.children[element.children.length - 1]
      if (lastNode && lastNode.type === 3 && lastNode.text === ' ' && !inPre) {
        element.children.pop()
      }
      // pop stack //对匹配元素进行出栈，并且closeElement闭合元素
      stack.length -= 1
      currentParent = stack[stack.length - 1]
      closeElement(element)
    },

    chars (text: string) { // 处理标签中的文本内容
      if (!currentParent) { // 如果匹配到text文本没有父级报警告，并返回不编译
        if (process.env.NODE_ENV !== 'production') {
          if (text === template) {
            warnOnce(
              'Component template requires a root element, rather than just text.'
            )
          } else if ((text = text.trim())) {
            warnOnce(
              `text "${text}" outside root element will be ignored.`
            )
          }
        }
        return
      }
      // IE textarea placeholder bug
      /* istanbul ignore if */
      if (isIE &&
        currentParent.tag === 'textarea' &&
        currentParent.attrsMap.placeholder === text
      ) {
        return // 针对ie的textare [placeholder] 的bug进行处理
      }
      /** 真正的对text进行处理 */
      // 因为text文本属于Children级（父级的下一级），所以要对Children进行操作
      const children = currentParent.children 
      text = inPre || text.trim() // 对text文本的处理（这个先处理的有点陌生）
        ? isTextTag(currentParent) ? text : decodeHTMLCached(text)
        // only preserve whitespace if its not right after a starting tag
        // 仅在开始标记后保留空白(下面空白字符的保留)
        : preserveWhitespace && children.length ? ' ' : ''
      if (text) { // 经过第一次解析还有text
        let res
        // 解析含有变量的text文本如：（{{ 变量 }}）
        if (!inVPre && text !== ' ' && (res = parseText(text, delimiters))) {
          children.push({
            type: 2,
            expression: res.expression, // 解析出的表达式
            tokens: res.tokens, // 解析出的tokens
            text
          })
        // 普通纯静态文本
        } else if (text !== ' ' || !children.length || children[children.length - 1].text !== ' ') {
          children.push({
            type: 3,
            text
          })
        }
      }
    },
    comment (text: string) { // 处理注释节点的函数
      /** 简单的在其父级推入一个文本Children，而这个Children的isComment为true */
      currentParent.children.push({
        type: 3,
        text,
        isComment: true
      })
    }
  })
  return root
}

/** 处理v-pre指令修改成el中的属性 */
function processPre (el) {
  if (getAndRemoveAttr(el, 'v-pre') != null) {
    el.pre = true
  }
}

/** 处理attrsList生成attrs */
function processRawAttrs (el) {
  const l = el.attrsList.length
  // 修改el的attrs属性将list转化为name、value形式的对象数组
  // attrs和attrsList的区别是attrs中的value必定是字符串
  if (l) {
    const attrs = el.attrs = new Array(l)
    for (let i = 0; i < l; i++) {
      attrs[i] = {
        name: el.attrsList[i].name,
        value: JSON.stringify(el.attrsList[i].value)
      }
    }
  } else if (!el.pre) {
    // non root node in pre blocks with no attributes
    // 非根节点与不前块属性
    el.plain = true
  }
}

/** 处理element */
export function processElement (element: ASTElement, options: CompilerOptions) {
  processKey(element) // 检查元素的key的可用并且复制key

  // determine whether this is a plain element after
  // removing structural attributes
  // 在删除结构属性后确定这是否是普通元素
  element.plain = !element.key && !element.attrsList.length

  processRef(element) // 获取ref属性并且检查是否v-for的子元素
  processSlot(element) // 解析插槽相关内容（[slot-scope]、[slot]、<solt>）
  processComponent(element) //解析组件（主要为is动态组件内容）
  // 循环调用options传入的解析器（options.modules['transformNode']）
  for (let i = 0; i < transforms.length; i++) {
    element = transforms[i](element, options) || element
  }
  //解析attrs属性
  /**
   * 1、解析指令（v-bind、v-on）和修饰符
   * 2、正常的指令
   * 3、静态文本
    */
  processAttrs(element) 
}

function processKey (el) {
  const exp = getBindingAttr(el, 'key') // 获取绑定key为key的值
  if (exp) { // 检查并赋值key
    if (process.env.NODE_ENV !== 'production' && el.tag === 'template') {
      warn(`<template> cannot be keyed. Place the key on real elements instead.`)
    }
    el.key = exp
  }
}

function processRef (el) {
  const ref = getBindingAttr(el, 'ref') // 获取绑定key为ref的值
  if (ref) { // 存在赋值并检查是否为v-for的子元素
    el.ref = ref
    el.refInFor = checkInFor(el)
  }
}

/** 处理v-for指令 */
export function processFor (el: ASTElement) {
  let exp
  // 获取v-for的属性并存在
  if ((exp = getAndRemoveAttr(el, 'v-for'))) {
    const res = parseFor(exp) //解析for中的值
    if (res) {
      extend(el, res)
    } else if (process.env.NODE_ENV !== 'production') {
      warn(
        `Invalid v-for expression: ${exp}`
      )
    }
  }
}

type ForParseResult = {
  for: string;
  alias: string;
  iterator1?: string;
  iterator2?: string;
};

export function parseFor (exp: string): ?ForParseResult {
  const inMatch = exp.match(forAliasRE) // 调用正则匹配（in、of）两边的内容
  if (!inMatch) return
  const res = {}
  res.for = inMatch[2].trim() // 在匹配结果中拿到需要循环的数据（in、of后面的字符串）
  const alias = inMatch[1].trim().replace(stripParensRE, '')// 去掉空格和括号
  const iteratorMatch = alias.match(forIteratorRE) // 匹配最后2或1个逗号后的内容（0个结果含有逗号）
  if (iteratorMatch) {
    res.alias = alias.replace(forIteratorRE, '') // 既然上面是匹配逗号后的内容则replace替换成空仅剩前面的了
    res.iterator1 = iteratorMatch[1].trim() // 一个逗号的情况
    if (iteratorMatch[2]) {
      res.iterator2 = iteratorMatch[2].trim() //两个逗号的情况
    }
  } else {
    res.alias = alias // 没有匹配逗号直接当做别名使用
  }
  return res
}

/** 处理v-if、v-else、v-else-if 
 * 既然处理这三个值那么就是获取其属性并删除attrsList中的值并在el中（if、else、elseif）对应赋值
*/
function processIf (el) {
  const exp = getAndRemoveAttr(el, 'v-if')
  if (exp) {
    el.if = exp
    // if条件是一个ifConditions数组，针对不同表达式和不同条件进行切换
    addIfCondition(el, {
      exp: exp,
      block: el
    })
  } else {
    if (getAndRemoveAttr(el, 'v-else') != null) {
      el.else = true
    }
    const elseif = getAndRemoveAttr(el, 'v-else-if')
    if (elseif) {
      el.elseif = elseif
    }
  }
}

/** 有点转不过弯理解一下 */
function processIfConditions (el, parent) {
  // 从尾开始找找到第一个同级而且含有if属性的，赋值el.elseif到prev元素上
  const prev = findPrevElement(parent.children)
  if (prev && prev.if) {
    addIfCondition(prev, {
      exp: el.elseif,
      block: el
    })
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `v-${el.elseif ? ('else-if="' + el.elseif + '"') : 'else'} ` +
      `used on element <${el.tag}> without corresponding v-if.`
    )
  }
}

/** 查找上一个元素 */
function findPrevElement (children: Array<any>): ASTElement | void {
  let i = children.length
  while (i--) { // 从后往前找，找到第一个DOM、并返回，找不到删除Children的第一个元素并报错
    if (children[i].type === 1) {
      return children[i]
    } else {
      if (process.env.NODE_ENV !== 'production' && children[i].text !== ' ') {
        warn(
          `text "${children[i].text.trim()}" between v-if and v-else(-if) ` +
          `will be ignored.`
        )
      }
      children.pop()
    }
  }
}

/** 添加if条件 */
export function addIfCondition (el: ASTElement, condition: ASTIfCondition) {
  if (!el.ifConditions) {
    el.ifConditions = []
  }
  el.ifConditions.push(condition) //为元素添加if条件
}

function processOnce (el) {
  const once = getAndRemoveAttr(el, 'v-once')
  if (once != null) {
    el.once = true
  }
}

/** 解析插槽内容 （需要重点理解）*/
function processSlot (el) {
  // 解析插槽并且获取name属性
  if (el.tag === 'slot') {
    el.slotName = getBindingAttr(el, 'name')
    if (process.env.NODE_ENV !== 'production' && el.key) {
      warn(
        `\`key\` does not work on <slot> because slots are abstract outlets ` +
        `and can possibly expand into multiple elements. ` +
        `Use the key on a wrapping element instead.`
      )
    }
  } else {
    let slotScope
    // 解析tag为template
    if (el.tag === 'template') {
      // 兼容2.5以下的写法（2.5以下[scope]新的[slot-scope]）
      slotScope = getAndRemoveAttr(el, 'scope')
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && slotScope) {
        warn(
          `the "scope" attribute for scoped slots have been deprecated and ` +
          `replaced by "slot-scope" since 2.5. The new "slot-scope" attribute ` +
          `can also be used on plain elements in addition to <template> to ` +
          `denote scoped slots.`,
          true
        )
      }
      el.slotScope = slotScope || getAndRemoveAttr(el, 'slot-scope')
    // 直接获取[slot-scope]属性是否存在并且检测是否在v-for中
    } else if ((slotScope = getAndRemoveAttr(el, 'slot-scope'))) {
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && el.attrsMap['v-for']) {
        warn(
          `Ambiguous combined usage of slot-scope and v-for on <${el.tag}> ` +
          `(v-for takes higher priority). Use a wrapper <template> for the ` +
          `scoped slot to make it clearer.`,
          true
        )
      }
      el.slotScope = slotScope
    }
    // 最后解析是否含有slot属性
    const slotTarget = getBindingAttr(el, 'slot')
    if (slotTarget) {
      el.slotTarget = slotTarget === '""' ? '"default"' : slotTarget //规范一下
      // preserve slot as an attribute for native shadow DOM compat
      // only for non-scoped slots.
      // 仅将slot保留为非作用域插槽的本机影子dom compat的属性。
      if (el.tag !== 'template' && !el.slotScope) {
        addAttr(el, 'slot', slotTarget) //在不是template和slotScope情况下为el添加slot属性
      }
    }
  }
}

/** 解析组件 （重点挖掘inline-template作用）*/
function processComponent (el) {
  let binding
  if ((binding = getBindingAttr(el, 'is'))) { // 获取组件的is属性（动态组件）
    el.component = binding
  }
  // 获取inline-template属性（作用不详）
  if (getAndRemoveAttr(el, 'inline-template') != null) {
    el.inlineTemplate = true
  }
}

/**  解析属性*/
function processAttrs (el) {
  const list = el.attrsList // 拿到list
  let i, l, name, rawName, value, modifiers, isProp
  for (i = 0, l = list.length; i < l; i++) {
    // name 和value
    name = rawName = list[i].name
    value = list[i].value
    // 如果是指令的处理（动态数据）
    if (dirRE.test(name)) {
      // mark element as dynamic // 将元素标记为动态
      el.hasBindings = true
      // modifiers
      modifiers = parseModifiers(name) // 解析改指令的修饰符
      if (modifiers) {
        name = name.replace(modifierRE, '') // 为何要重新赋值name？
      }
      if (bindRE.test(name)) { // v-bind // 如果是一个bind
        name = name.replace(bindRE, '') // 又重新赋值name
        value = parseFilters(value) // 解析filters
        isProp = false // ?
        if (modifiers) { // 存在修饰符（并且处理3个修饰符）
          if (modifiers.prop) { // 被用于绑定 DOM 属性（有什么不同？）。如果标签是一个组件，那么 .prop 将在组件的 $el 上设置属性
            isProp = true
            name = camelize(name) // 转驼峰又赋值name
            if (name === 'innerHtml') name = 'innerHTML' // innerHTML name
          }
          if (modifiers.camel) { //  (2.1.0+) transform the kebab-case attribute name into camelCase.
            name = camelize(name)
          }
          if (modifiers.sync) { //  (2.3.0+) 语法糖，会扩展成一个更新父组件绑定值的 v-on 侦听器。
            addHandler( // 添加一个事件（有何用）
              el,
              `update:${camelize(name)}`,
              genAssignmentCode(value, `$event`)
            )
          }
        }
        // 存在prop修饰符 （添加prop或者attr属性）
        if (isProp || (
          !el.component && platformMustUseProp(el.tag, el.attrsMap.type, name)
        )) {
          addProp(el, name, value)
        } else {
          addAttr(el, name, value)
        }
      } else if (onRE.test(name)) { // v-on
        // 解析v-on属性添加事件传入修饰符
        name = name.replace(onRE, '')
        addHandler(el, name, value, modifiers, false, warn)
      } else { // normal directives
        // 正常的指令的处理
        name = name.replace(dirRE, '')
        // parse arg
        const argMatch = name.match(argRE)
        const arg = argMatch && argMatch[1]
        if (arg) {
          name = name.slice(0, -(arg.length + 1))
        }
        addDirective(el, name, rawName, value, arg, modifiers)
        if (process.env.NODE_ENV !== 'production' && name === 'model') {
          checkForAliasModel(el, value)
        }
      }
    } else {
      // literal attribute 文字属性的处理（静态数据）
      if (process.env.NODE_ENV !== 'production') {
        // 检查或者解析text（非生产环境可以跳过）
        const res = parseText(value, delimiters)
        if (res) {
          warn(
            `${name}="${value}": ` +
            'Interpolation inside attributes has been removed. ' +
            'Use v-bind or the colon shorthand instead. For example, ' +
            'instead of <div id="{{ val }}">, use <div :id="val">.'
          )
        }
      }
      // 添加文字（静态）属性
      addAttr(el, name, JSON.stringify(value))
      // #6887 firefox doesn't update muted state if set via attribute
      // even immediately after element creation
      // 即使在创建元素后立即通过属性设置，火狐也不会更新其状态。
      // (要研究一下是通过什么方法解决的问题)
      if (!el.component &&
          name === 'muted' &&
          platformMustUseProp(el.tag, el.attrsMap.type, name)) {
        addProp(el, name, 'true')
      }
    }
  }
}

// 递归查找并检查是否是v-for中的子元素
function checkInFor (el: ASTElement): boolean {
  let parent = el
  while (parent) {
    if (parent.for !== undefined) {
      return true
    }
    parent = parent.parent
  }
  return false
}

/** 解析修饰符 */
function parseModifiers (name: string): Object | void {
  const match = name.match(modifierRE) // 获取所有修饰符
  if (match) {
    const ret = {}
    match.forEach(m => { ret[m.slice(1)] = true }) // 循环赋值解析的修饰符
    return ret
  }
}

/**  将attrList属性映射成对象并返回（其中为什么要检查是否为ie？）*/
function makeAttrsMap (attrs: Array<Object>): Object {
  const map = {}
  for (let i = 0, l = attrs.length; i < l; i++) {
    if (
      process.env.NODE_ENV !== 'production' &&
      map[attrs[i].name] && !isIE && !isEdge
    ) {
      warn('duplicate attribute: ' + attrs[i].name)
    }
    map[attrs[i].name] = attrs[i].value
  }
  return map
}

// for script (e.g. type="x/template") or style, do not decode content
function isTextTag (el): boolean { // 判断tag是否为script或者style，因为这些并不进行编译
  return el.tag === 'script' || el.tag === 'style'
}

/** 是否为禁止标签 */
function isForbiddenTag (el): boolean {
  return (
    el.tag === 'style' ||
    (el.tag === 'script' && (
      !el.attrsMap.type ||
      el.attrsMap.type === 'text/javascript'
    ))
  )
}

const ieNSBug = /^xmlns:NS\d+/
const ieNSPrefix = /^NS\d+:/

/* istanbul ignore next */
/** 重点研究下这是什么bug */
function guardIESVGBug (attrs) { //保护ie下的SVGbug
  const res = []
  // 实际上循环attrs利用正则匹配并且替换内容
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i]
    if (!ieNSBug.test(attr.name)) {
      attr.name = attr.name.replace(ieNSPrefix, '')
      res.push(attr)
    }
  }
  return res
}

/** 检查model的命名和for的别名 */
function checkForAliasModel (el, value) {
  let _el = el
  while (_el) {
    if (_el.for && _el.alias === value) {
      warn(
        `<${el.tag} v-model="${value}">: ` +
        `You are binding v-model directly to a v-for iteration alias. ` +
        `This will not be able to modify the v-for source array because ` +
        `writing to the alias is like modifying a function local variable. ` +
        `Consider using an array of objects and use v-model on an object property instead.`
      )
    }
    _el = _el.parent
  }
}
