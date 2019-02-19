/* @flow */

import { cached } from 'shared/util'
import { parseFilters } from './filter-parser'

const defaultTagRE = /\{\{((?:.|\n)+?)\}\}/g
const regexEscapeRE = /[-.*+?^${}()|[\]\/\\]/g

const buildRegex = cached(delimiters => {
  const open = delimiters[0].replace(regexEscapeRE, '\\$&')
  const close = delimiters[1].replace(regexEscapeRE, '\\$&')
  return new RegExp(open + '((?:.|\\n)+?)' + close, 'g')
})

type TextParseResult = {
  expression: string,
  tokens: Array<string | { '@binding': string }>
}

/** 解析text文本的函数 */
export function parseText (
  text: string,
  delimiters?: [string, string]
): TextParseResult | void {
  // 匹配变量的正则
  const tagRE = delimiters ? buildRegex(delimiters) : defaultTagRE
  if (!tagRE.test(text)) { // 不含变量直接返回
    return
  }
  const tokens = []
  const rawTokens = []
  let lastIndex = tagRE.lastIndex = 0
  let match, index, tokenValue
  // 因为exec和text方法都会导致正则的lastIndex改变
  // 所以前面改变了lastIndex = 0 
  // 然后现在这里进行while循环全局匹配text文本
  while ((match = tagRE.exec(text))) {
    index = match.index
    // push text token
    if (index > lastIndex) { 
      // 当index > lastIndex的时候证明该区间的内容没有匹配所以需要添加纯文本内容
      rawTokens.push(tokenValue = text.slice(lastIndex, index))
      tokens.push(JSON.stringify(tokenValue))
    }
    // tag token
    const exp = parseFilters(match[1].trim()) // 对匹配结果进行过滤器的解析
    tokens.push(`_s(${exp})`) // _s --> toString  向tokens中推入变量生成文本的方法
    rawTokens.push({ '@binding': exp }) // 标准化
    lastIndex = index + match[0].length // 移动index的位置
  }
  // 当匹配的位置小于 text的长度的时候 可以说明匹配的插值表达式 后面还有纯文本需要插入
  if (lastIndex < text.length) {
    rawTokens.push(tokenValue = text.slice(lastIndex))
    tokens.push(JSON.stringify(tokenValue))
  }
  // 返回所有匹配结果
  return {
    expression: tokens.join('+'),
    tokens: rawTokens
  }
}
