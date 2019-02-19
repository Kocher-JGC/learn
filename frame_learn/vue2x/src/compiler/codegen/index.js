/* @flow */

import { genHandlers } from './events'
import baseDirectives from '../directives/index'
import { camelize, no, extend } from 'shared/util'
import { baseWarn, pluckModuleFunction } from '../helpers'

type TransformFunction = (el: ASTElement, code: string) => string;
type DataGenFunction = (el: ASTElement) => string;
type DirectiveFunction = (el: ASTElement, dir: ASTDirective, warn: Function) => boolean;

export class CodegenState {
  options: CompilerOptions;
  warn: Function;
  transforms: Array<TransformFunction>;
  dataGenFns: Array<DataGenFunction>;
  directives: { [key: string]: DirectiveFunction };
  maybeComponent: (el: ASTElement) => boolean;
  onceId: number;
  staticRenderFns: Array<string>;

  constructor (options: CompilerOptions) {
    this.options = options
    this.warn = options.warn || baseWarn
    // 提取transformCode、genData模块功能
    this.transforms = pluckModuleFunction(options.modules, 'transformCode')
    this.dataGenFns = pluckModuleFunction(options.modules, 'genData')
    // 对指令的扩展和修改
    this.directives = extend(extend({}, baseDirectives), options.directives)``
    const isReservedTag = options.isReservedTag || no
    // 是保留标签有可能是组件
    this.maybeComponent = (el: ASTElement) => !isReservedTag(el.tag)
    this.onceId = 0
    this.staticRenderFns = []
  }
}

export type CodegenResult = {
  render: string,
  staticRenderFns: Array<string>
};

export function generate (
  ast: ASTElement | void,
  options: CompilerOptions
): CodegenResult {
  const state = new CodegenState(options) //将options生成Codegen状态类
  // 调用genElement真正生成用于渲染的函数字符串
  const code = ast ? genElement(ast, state) : '_c("div")'
  return {
    render: `with(this){return ${code}}`,
    staticRenderFns: state.staticRenderFns
  }
}

export function genElement (el: ASTElement, state: CodegenState): string {
  if (el.staticRoot && !el.staticProcessed) {
    return genStatic(el, state) // 静态根而且没有进行静态处理的调用genStatic创建
  } else if (el.once && !el.onceProcessed) {
    return genOnce(el, state) // 是once元素而且没有进行once处理调用genOnce
  } else if (el.for && !el.forProcessed) {
    return genFor(el, state) // 是for而且没有进行for处理调用genFor处理
  } else if (el.if && !el.ifProcessed) {
    return genIf(el, state) // 是if而且没有进行if处理调用genIF处理
  } else if (el.tag === 'template' && !el.slotTarget) {
    // 标签名字是template 调用genChildren处理
    return genChildren(el, state) || 'void 0'
  } else if (el.tag === 'slot') {
    return genSlot(el, state) // 标签名是slot调用genSlot进行处理
  } else {
    // component or element 组件或者是元素的处理
    let code
    if (el.component) {
      code = genComponent(el.component, el, state)
    } else {
      // 不是普通元素进行genData获取data
      const data = el.plain ? undefined : genData(el, state)

      /** inlineTemplate 注意使用了 */
      const children = el.inlineTemplate ? null : genChildren(el, state, true)
      // 有data连data有child连child
      code = `_c('${el.tag}'${
        data ? `,${data}` : '' // data
      }${
        children ? `,${children}` : '' // children
      })`
    }
    // module transforms // 调用模块的transformCode进行转换
    for (let i = 0; i < state.transforms.length; i++) {
      code = state.transforms[i](el, code)
    }
    return code // 返回编译的code
  }
}

// hoist static sub-trees out 提取静态子树
function genStatic (el: ASTElement, state: CodegenState): string {
  // 标志已经处理了并且递归调用genElement来创建code
  el.staticProcessed = true
  state.staticRenderFns.push(`with(this){return ${genElement(el, state)}}`)
  // 实际调用renderStatic
  return `_m(${
    state.staticRenderFns.length - 1
  }${
    el.staticInFor ? ',true' : ''
  })`
}

// v-once
function genOnce (el: ASTElement, state: CodegenState): string {
  el.onceProcessed = true
  if (el.if && !el.ifProcessed) {
    return genIf(el, state) // 是单次渲染而且有if的调用genIf创建
  } else if (el.staticInFor) { //静态v-for处理
    let key = ''
    let parent = el.parent
    while (parent) { //找到父级是for的拿到key并退出循环
      if (parent.for) {
        key = parent.key
        break
      }
      parent = parent.parent
    }
    if (!key) {
      process.env.NODE_ENV !== 'production' && state.warn(
        `v-once can only be used inside v-for that is keyed. `
      )
      return genElement(el, state)
    }
    // markOnce 调用markOnce渲染  并递归调用genElement创建子元素
    return `_o(${genElement(el, state)},${state.onceId++},${key})`
  } else {
    return genStatic(el, state) // 同样调用genStatic当做静态树渲染
  }
}

export function genIf (
  el: any,
  state: CodegenState,
  altGen?: Function,
  altEmpty?: string
): string {
  el.ifProcessed = true // avoid recursion
  return genIfConditions(el.ifConditions.slice(), state, altGen, altEmpty)
}

/** 对v-if\v-else-if\else指令的处理 */
function genIfConditions (
  conditions: ASTIfConditions,
  state: CodegenState,
  altGen?: Function,
  altEmpty?: string
): string {
  if (!conditions.length) {
    return altEmpty || '_e()' // createEmptyVNode 没有条件创建空的vnode
  }

  const condition = conditions.shift() // 从前往后删除
  if (condition.exp) { // 有判断表达式（判断体）
    return `(${condition.exp})?${
      genTernaryExp(condition.block)
    }:${
      genIfConditions(conditions, state, altGen, altEmpty) // 递归调用
    }`
  } else {
    return `${genTernaryExp(condition.block)}` // 无判断表达式的。。（有什么意义和作用呢？）
  }

  // v-if with v-once should generate code like (a)?_m(0):_m(1)
  // 使用v-once的v-if应该生成类似（a）？_m（0）：_m（1）
  function genTernaryExp (el) {
    return altGen // 有传入的处理函数调用传入的处理函数
      ? altGen(el, state)
      : el.once // 没有的判断是once处理还是element处理
        ? genOnce(el, state)
        : genElement(el, state)
  }
}

export function genFor (
  el: any,
  state: CodegenState,
  altGen?: Function,
  altHelper?: string
): string {
  /** 拿到for表达式（传入的变量）、别名、 参数1、参数2*/
  const exp = el.for
  const alias = el.alias
  const iterator1 = el.iterator1 ? `,${el.iterator1}` : ''
  const iterator2 = el.iterator2 ? `,${el.iterator2}` : ''

  // v-for没有key的警告
  if (process.env.NODE_ENV !== 'production' &&
    state.maybeComponent(el) &&
    el.tag !== 'slot' &&
    el.tag !== 'template' &&
    !el.key
  ) {
    state.warn(
      `<${el.tag} v-for="${alias} in ${exp}">: component lists rendered with ` +
      `v-for should have explicit keys. ` +
      `See https://vuejs.org/guide/list.html#key for more info.`,
      true /* tip */
    )
  }

  el.forProcessed = true // avoid recursion
  // 调用renderList或者传入的altHelper进行渲染list的处理 
  // 组装渲染的函数调用
  return `${altHelper || '_l'}((${exp}),` +
    `function(${alias}${iterator1}${iterator2}){` +
      `return ${(altGen || genElement)(el, state)}` + // 调用传入的处理或者使用genElement进行处理后面的编译code的结果
    '})'
}

/** 数据的处理 */
export function genData (el: ASTElement, state: CodegenState): string {
  let data = '{'

  // directives first.
  // directives may mutate the el's other properties before they are generated.
  // 指令在生成前可能会改变EL的其他属性。
  const dirs = genDirectives(el, state) // 先生成指令的内容因为如上
  if (dirs) data += dirs + ','

  /** 
   * 1、静态值的赋值和获取（key、ref、refInFor、pre、component）
   * 2、调用模块的数据生成功能生成其他数据(需要返回字符串)
   * 3、动态的attrs、DOMProps、event、nativeEvent的处理（genProps、genHandlers）
   * 4、slot插槽标签的处理（仅用于不是作用域插槽）、作用域插槽调用genScopedSlots进行处理
   * 5、v-model的处理(value、callback、expression)
   * 6、inlineTemplate的处理（又出现了一次）
   */

  // key
  if (el.key) {
    data += `key:${el.key},`
  }
  // ref
  if (el.ref) {
    data += `ref:${el.ref},`
  }
  if (el.refInFor) {
    data += `refInFor:true,`
  }
  // pre
  if (el.pre) {
    data += `pre:true,`
  }
  // record original tag name for components using "is" attribute
  if (el.component) {
    data += `tag:"${el.tag}",`
  }
  // module data generation functions 模块的数据生成功能
  for (let i = 0; i < state.dataGenFns.length; i++) {
    data += state.dataGenFns[i](el)
  }
  // attributes
  if (el.attrs) {
    data += `attrs:{${genProps(el.attrs)}},`
  }
  // DOM props
  if (el.props) {
    data += `domProps:{${genProps(el.props)}},`
  }
  // event handlers
  if (el.events) {
    data += `${genHandlers(el.events, false, state.warn)},`
  }
  if (el.nativeEvents) {
    data += `${genHandlers(el.nativeEvents, true, state.warn)},`
  }
  // slot target
  // only for non-scoped slots
  if (el.slotTarget && !el.slotScope) {
    data += `slot:${el.slotTarget},`
  }
  // scoped slots
  if (el.scopedSlots) {
    data += `${genScopedSlots(el.scopedSlots, state)},`
  }
  // component v-model
  if (el.model) {
    data += `model:{value:${
      el.model.value
    },callback:${
      el.model.callback
    },expression:${
      el.model.expression
    }},`
  }
  // inline-template
  if (el.inlineTemplate) {
    const inlineTemplate = genInlineTemplate(el, state)
    if (inlineTemplate) {
      data += `${inlineTemplate},`
    }
  }
  /** 
   * 1、对多余逗号的处理
   * 2、对v-bind和v-on包裹的data的处理（这是用来干什么的 ？？）
   */
  data = data.replace(/,$/, '') + '}'
  // v-bind data wrap
  if (el.wrapData) {
    data = el.wrapData(data)
  }
  // v-on data wrap
  if (el.wrapListeners) {
    data = el.wrapListeners(data)
  }
  return data
}

/** 指令的处理 */
function genDirectives (el: ASTElement, state: CodegenState): string | void {
  const dirs = el.directives
  if (!dirs) return
  let res = 'directives:['
  let hasRuntime = false
  let i, l, dir, needRuntime
  // 循环指令
  for (i = 0, l = dirs.length; i < l; i++) {
    dir = dirs[i]
    needRuntime = true
    const gen: DirectiveFunction = state.directives[dir.name] // 拿到对应指令的内容
    if (gen) {
      // compile-time directive that manipulates AST.
      // returns true if it also needs a runtime counterpart.
      // 处理ast的编译时指令。如果它还需要运行时对应项，则返回true。
      needRuntime = !!gen(el, dir, state.warn)
    }
    // 需要运行时对应 组装指令的内容[name、rawName、value、expression、arg、modifiers]
    if (needRuntime) {
      hasRuntime = true
      res += `{name:"${dir.name}",rawName:"${dir.rawName}"${
        dir.value ? `,value:(${dir.value}),expression:${JSON.stringify(dir.value)}` : ''
      }${
        dir.arg ? `,arg:"${dir.arg}"` : ''
      }${
        dir.modifiers ? `,modifiers:${JSON.stringify(dir.modifiers)}` : ''
      }},`
    }
  }
  if (hasRuntime) { // 需要运行时候对应那就组装并返回
    return res.slice(0, -1) + ']'
  }
}

function genInlineTemplate (el: ASTElement, state: CodegenState): ?string {
  const ast = el.children[0]
  // 内联模板组件必须只有一个子元素。
  if (process.env.NODE_ENV !== 'production' && (
    el.children.length !== 1 || ast.type !== 1
  )) {
    state.warn('Inline-template components must have exactly one child element.')
  }
  if (ast.type === 1) { // 有标签的ast节点
    /** 重复调用generate进行创建render然后就组织字符串赋值 */
    const inlineRenderFns = generate(ast, state.options)
    return `inlineTemplate:{render:function(){${
      inlineRenderFns.render
    }},staticRenderFns:[${
      inlineRenderFns.staticRenderFns.map(code => `function(){${code}}`).join(',')
    }]}`
  }
}

/** 循环调用genScopedSlot创建多个作用域插槽 */
function genScopedSlots (
  slots: { [key: string]: ASTElement },
  state: CodegenState
): string {
  return `scopedSlots:_u([${ // _u --> resolveScopedSlots
    Object.keys(slots).map(key => {
      return genScopedSlot(key, slots[key], state)
    }).join(',') // 返回了形如{key，fn}的数组所以要改成字符串连接
  }])`
}

/**  创建作用域插槽的code*/
function genScopedSlot (
  key: string,
  el: ASTElement,
  state: CodegenState
): string {
  if (el.for && !el.forProcessed) {
    return genForScopedSlot(key, el, state) // for的处理
  }
  // 根据是否为template调用genChildren或者genElement创建表达式
  const fn = `function(${String(el.slotScope)}){` +
    `return ${el.tag === 'template'
      ? el.if
        ? `${el.if}?${genChildren(el, state) || 'undefined'}:undefined`
        : genChildren(el, state) || 'undefined'
      : genElement(el, state)
    }}`
  return `{key:${key},fn:${fn}}`
}

/** 如果是for的其实是外包一层_l的处理再调用genScopedSlot创建作用域插槽的code */
function genForScopedSlot (
  key: string,
  el: any,
  state: CodegenState
): string {
  const exp = el.for
  const alias = el.alias
  const iterator1 = el.iterator1 ? `,${el.iterator1}` : ''
  const iterator2 = el.iterator2 ? `,${el.iterator2}` : ''
  el.forProcessed = true // avoid recursion
  return `_l((${exp}),` +
    `function(${alias}${iterator1}${iterator2}){` +
      `return ${genScopedSlot(key, el, state)}` +
    '})'
}

export function genChildren (
  el: ASTElement,
  state: CodegenState,
  checkSkip?: boolean,
  altGenElement?: Function,
  altGenNode?: Function
): string | void {
  const children = el.children
  if (children.length) {
    const el: any = children[0]
    // optimize single v-for 优化单个v-for的Children的情况
    if (children.length === 1 &&
      el.for &&
      el.tag !== 'template' &&
      el.tag !== 'slot'
    ) {
      return (altGenElement || genElement)(el, state)
    }
    // 是否跳过标准化类型
    const normalizationType = checkSkip
      ? getNormalizationType(children, state.maybeComponent)
      : 0
    const gen = altGenNode || genNode
    // 生成就是平时熟悉的数组就是Children，后面跟着一个数字表示着要不要标准化
    return `[${children.map(c => gen(c, state)).join(',')}]${
      normalizationType ? `,${normalizationType}` : ''
    }`
  }
}

// determine the normalization needed for the children array.
// 0: no normalization needed
// 1: simple normalization needed (possible 1-level deep nested array)
// 2: full normalization needed
/** 
 * 确定子数组所需的规范化。
 * 0、不需要标准化
 * 1、需要简单的规范化（可能是一级深嵌套数组）
 * 2、需要完全规范化
 */
function getNormalizationType (
  children: Array<ASTNode>,
  maybeComponent: (el: ASTElement) => boolean
): number {
  let res = 0
  /** 循环Children 
   * 1、el或者是if体的block满足needsNormalization --> 需要完全标准化
   * 2、在CodegenState可以得到maybeComponent是（是保留标签有可能是组件 --> 在这情况下需要简单标准化（一层）
   * 3、循环完了都不满足则不需要标准化
   */
  for (let i = 0; i < children.length; i++) {
    const el: ASTNode = children[i]
    if (el.type !== 1) { // 必须是有标签的ast
      continue
    }
    if (needsNormalization(el) ||
        (el.ifConditions && el.ifConditions.some(c => needsNormalization(c.block)))) {
      res = 2
      break
    }
    if (maybeComponent(el) ||
        (el.ifConditions && el.ifConditions.some(c => maybeComponent(c.block)))) {
      res = 1
    }
  }
  return res
}

/** v-for、tag=template|| slot 的需要进行标准化 */
function needsNormalization (el: ASTElement): boolean {
  return el.for !== undefined || el.tag === 'template' || el.tag === 'slot'
}

/** 对node进行编译code（分element、comment、text） */
function genNode (node: ASTNode, state: CodegenState): string {
  if (node.type === 1) {
    return genElement(node, state)
  } if (node.type === 3 && node.isComment) {
    return genComment(node)
  } else {
    return genText(node)
  }
}

/** 组装_v --> createTextVNode（创建textVnode） */
export function genText (text: ASTText | ASTExpression): string {
  return `_v(${text.type === 2
    ? text.expression // no need for () because already wrapped in _s()
    : transformSpecialNewlines(JSON.stringify(text.text)) //转义处理
  })`
}

/** 注释节点createEmptyVNode 创建空的vnode */
export function genComment (comment: ASTText): string {
  return `_e(${JSON.stringify(comment.text)})`
}

/** 创建插槽的函数 _t --> renderSlot 
 * 1、获取名字、Children（组装插槽内容和Children的code）
 * 2、获取attrs和bind的值
 * 3、判断attrs、bind、Children组装剩下的参数
 * 4、组装好所有code 返回字符串
*/
function genSlot (el: ASTElement, state: CodegenState): string {
  const slotName = el.slotName || '"default"'
  const children = genChildren(el, state)
  let res = `_t(${slotName}${children ? `,${children}` : ''}`
  const attrs = el.attrs && `{${el.attrs.map(a => `${camelize(a.name)}:${a.value}`).join(',')}}`
  const bind = el.attrsMap['v-bind']
  if ((attrs || bind) && !children) {
    res += `,null`
  }
  if (attrs) {
    res += `,${attrs}`
  }
  if (bind) {
    res += `${attrs ? '' : ',null'},${bind}`
  }
  return res + ')'
}

// componentName is el.component, take it as argument to shun flow's pessimistic refinement
function genComponent (
  componentName: string,
  el: ASTElement,
  state: CodegenState
): string {
  /** 获取Children和data，组装熟悉的_c （又出现了inlineTemplate，注意其作用）*/
  const children = el.inlineTemplate ? null : genChildren(el, state, true)
  return `_c(${componentName},${genData(el, state)}${
    children ? `,${children}` : ''
  })`
}

/** 实际上是循环props组装成json字符串并返回结果 */
function genProps (props: Array<{ name: string, value: any }>): string {
  let res = ''
  for (let i = 0; i < props.length; i++) {
    const prop = props[i]
    /* istanbul ignore if */
    if (__WEEX__) {
      res += `"${prop.name}":${generateValue(prop.value)},`
    } else {
      res += `"${prop.name}":${transformSpecialNewlines(prop.value)},`
    }
  }
  return res.slice(0, -1) // -1 把最后的逗号切掉
}

/* istanbul ignore next */
function generateValue (value) {
  if (typeof value === 'string') {
    return transformSpecialNewlines(value) // 转义处理
  }
  return JSON.stringify(value)
}

// #3895, #4268 转义处理
function transformSpecialNewlines (text: string): string {
  return text
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
/** 
  Javascript中的特殊字符一共有13个，建议都进行转义处理，如下：
    Unicode 字符值	转义序列	含义	类别
    \u0008	\b	Backspace	 
    \u0009	\t	Tab	空白
    \u000A	\n	换行符（换行）	行结束符
    \u000B	\v	垂直制表符	空白
    \u000C	\f	换页	空白
    \u000D	\r	回车	行结束符
    \u0020	  	空格        [可以不处理]
    \u0022	\"	双引号 (")	 
    \u0027	\'	单引号 (')	 
    \u005C	\\	反斜杠 (\)	 
    \u00A0	  	不间断空格	空白
    \u2028	   	行分隔符	行结束符
    \u2029	   	段落分隔符	行结束符
    \uFEFF	  	字节顺序标记	空白
 */
