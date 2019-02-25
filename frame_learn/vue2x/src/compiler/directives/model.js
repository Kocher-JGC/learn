/* @flow */

/**
 * Cross-platform code generation for component v-model
 * 组件V-model的跨平台代码生成
 */
export function genComponentModel (
  el: ASTElement,
  value: string,
  modifiers: ?ASTModifiers
): ?boolean {
  // number\trim2个修饰符
  const { number, trim } = modifiers || {}

  const baseValueExpression = '$$v' // 基础表达式$$v表示model的值
  let valueExpression = baseValueExpression
  if (trim) { // 去空格的,而且要字符串才成立(本来只有字符串才能去,说废话)
    valueExpression =
      `(typeof ${baseValueExpression} === 'string'` +
      `? ${baseValueExpression}.trim()` +
      `: ${baseValueExpression})`
  }
  if (number) { // 同样的是number转number
    valueExpression = `_n(${valueExpression})`
  }
  // 创建运行的表达式
  const assignment = genAssignmentCode(value, valueExpression)

  // 组装value\expression\cb
  el.model = {
    value: `(${value})`,
    expression: `"${value}"`,
    callback: `function (${baseValueExpression}) {${assignment}}`
  }
}

/**
 * Cross-platform codegen helper for generating v-model value assignment code.
 * 跨平台的辅助代码生成生成的V-model的值分配的代码。
 */
export function genAssignmentCode (
  value: string,
  assignment: string
): string {
  const res = parseModel(value)
  if (res.key === null) {
    return `${value}=${assignment}`
  } else {
    return `$set(${res.exp}, ${res.key}, ${assignment})`
  }
}

/**
 * Parse a v-model expression into a base path and a final key segment.
 * 将V-model表达式解析为基本路径和最后一个键段。
 * Handles both dot-path and possible square brackets.
 * 处理点路径和可能的方括号。
 *
 * Possible cases:
 *
 * - test
 * - test[key]
 * - test[test1[key]]
 * - test["a"][key]
 * - xxx.test[a[a].test1[key]]
 * - test.xxx.a["asa"][test1[key]]
 *
 */

let len, str, chr, index, expressionPos, expressionEndPos

type ModelParseResult = {
  exp: string,
  key: string | null
}

// 解析model 可以解析的形式如上注释
export function parseModel (val: string): ModelParseResult {
  // Fix https://github.com/vuejs/vue/pull/7730
  // allow v-model="obj.val " (trailing whitespace)
  val = val.trim() // 处理尾随空格
  len = val.length

  // 没有[]
  if (val.indexOf('[') < 0 || val.lastIndexOf(']') < len - 1) {
    index = val.lastIndexOf('.') // 找最后的点
    if (index > -1) { //
      return {
        exp: val.slice(0, index), // 表达式
        key: '"' + val.slice(index + 1) + '"' // 最后的是key
      }
    } else {
      // 找不到就是没有点的情况,那只有表达式
      return {
        exp: val,
        key: null
      }
    }
  }

  // 处理复杂的情况
  str = val
  index = expressionPos = expressionEndPos = 0

  while (!eof()) {
    chr = next() //处理下一个编码拿到其codeAt
    /* istanbul ignore if */
    if (isStringStart(chr)) { 
      parseString(chr) // 是开始那就解析开始
    } else if (chr === 0x5B) {
      parseBracket(chr)
    }
  }

  // 还不是很明白怎么就解析完了
  return {
    exp: val.slice(0, expressionPos),
    key: val.slice(expressionPos + 1, expressionEndPos)
  }
}

// 下一个编码
function next (): number {
  return str.charCodeAt(++index)
}

// 字符串和index关系
function eof (): boolean {
  return index >= len
}

// 判断是不是开始
function isStringStart (chr: number): boolean {
  return chr === 0x22 || chr === 0x27
}

// 往后再慢慢分析
function parseBracket (chr: number): void {
  let inBracket = 1
  expressionPos = index
  while (!eof()) {
    chr = next()
    if (isStringStart(chr)) {
      parseString(chr)
      continue
    }
    if (chr === 0x5B) inBracket++
    if (chr === 0x5D) inBracket--
    if (inBracket === 0) {
      expressionEndPos = index
      break
    }
  }
}

// 接着往下走找到一样的chr???
function parseString (chr: number): void {
  const stringQuote = chr
  while (!eof()) {
    chr = next()
    if (chr === stringQuote) {
      break
    }
  }
}
