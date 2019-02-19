/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson, Mozilla Public License
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

import { makeMap, no } from 'shared/util'
import { isNonPhrasingTag } from 'web/compiler/util'

// Regular Expressions for parsing tags and attributes
// 匹配attr的 1、等号前 2、等号 3、等号后用单引号或者双引号或者无引号的内容
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
// could use https://www.w3.org/TR/1999/REC-xml-names-19990114/#NT-QName
// but for Vue templates we can enforce a simple charset
const ncname = '[a-zA-Z_][\\w\\-\\.]*'
const qnameCapture = `((?:${ncname}\\:)?${ncname})`
// 开始标签
const startTagOpen = new RegExp(`^<${qnameCapture}`) 
//开始标记的结束的匹配
const startTagClose = /^\s*(\/?)>/ 
// 结束标签的匹配
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)
// doctype 、 注释节点 、兼容性（如ie）的注释节点的匹配
const doctype = /^<!DOCTYPE [^>]+>/i
// #7298: escape - to avoid being pased as HTML comment when inlined in page
const comment = /^<!\--/
const conditionalComment = /^<!\[/

let IS_REGEX_CAPTURING_BROKEN = false
'x'.replace(/x(.)?/g, function (m, g) {
  IS_REGEX_CAPTURING_BROKEN = g === ''
})

// Special Elements (can contain anything)
// 需要转化为纯文本的标签
export const isPlainTextElement = makeMap('script,style,textarea', true)
const reCache = {}

// 转译
const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t'
}
// 转译后的attr的匹配的正则，同时还有换行匹配的正则
const encodedAttr = /&(?:lt|gt|quot|amp);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#10|#9);/g

// #5992
const isIgnoreNewlineTag = makeMap('pre,textarea', true) // pre和textare需要忽略换行的匹配
const shouldIgnoreFirstNewline = (tag, html) => tag && isIgnoreNewlineTag(tag) && html[0] === '\n'

/** shouldDecodeNewlines确定编译时候需不需要对换行符号进行匹配
 * 对已经被编译的value进行decodingMap转码
 */
function decodeAttr (value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}

/** 解析HTML真正的函数 */
export function parseHTML (html, options) {
  const stack = []
  const expectHTML = options.expectHTML // 选项预期的html
  const isUnaryTag = options.isUnaryTag || no // 是否一元标签
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no // // 能够是左开标签
  let index = 0
  let last, lastTag
  while (html) { // 解析html字符串
    last = html
    // Make sure we're not in a plaintext content element like script/style
    // 确保我们没有使用script/style之类的纯文本内容元素
    if (!lastTag || !isPlainTextElement(lastTag)) {
      let textEnd = html.indexOf('<') // 匹配开始括号
      if (textEnd === 0) {
        // Comment: 如果是注释节点
        if (comment.test(html)) {
          const commentEnd = html.indexOf('-->')

          if (commentEnd >= 0) {
            if (options.shouldKeepComment) { // 需要保留注释节点
              options.comment(html.substring(4, commentEnd))
            }
            advance(commentEnd + 3) // 跳过整个注释节点的文本然后进入下一次循环
            continue
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        if (conditionalComment.test(html)) {
          // 兼容的注释节点的匹配直接到其后面进入下一次循环
          const conditionalEnd = html.indexOf(']>')

          if (conditionalEnd >= 0) {
            advance(conditionalEnd + 2)
            continue
          }
        }

        // Doctype: 匹配doctype一段 并跳过进入下一次循环
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length)
          continue
        }

        // End tag: 匹配结束标签并且 调用parseEndTag对内容进行处理
        const endTagMatch = html.match(endTag)
        if (endTagMatch) {
          const curIndex = index
          advance(endTagMatch[0].length)
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }

        // Start tag: 匹配开始标签并且 调用handleStartTag 对html进行处理
        const startTagMatch = parseStartTag()
        if (startTagMatch) {
          handleStartTag(startTagMatch)
          if (shouldIgnoreFirstNewline(lastTag, html)) {
            advance(1)
          }
          continue
        }
      }
      /** 上面是 开头为'<'的情况 */

      let text, rest, next
      if (textEnd >= 0) { // 大于0表示后面还有可能有html标签
        rest = html.slice(textEnd) // 把<之前的文本截取出来进行处理
        while (
          !endTag.test(rest) && // 不含有结束标签
          !startTagOpen.test(rest) && // 严谨的判断一下不含有开始标签
          !comment.test(rest) && // 不是注释节点
          !conditionalComment.test(rest) // 不是兼容的注释节点
        ) {
          // 对含有< 的文本进行处理
          // < in plain text, be forgiving and treat it as text
          next = rest.indexOf('<', 1)
          if (next < 0) break
          textEnd += next
          rest = html.slice(textEnd)
        }
        // 处理完后，截取text和HTML的index
        text = html.substring(0, textEnd)
        advance(textEnd)
      }

      if (textEnd < 0) { // 不存在HTML标签可能只剩文本了
        text = html
        html = ''
      }

      if (options.chars && text) {
        options.chars(text) // 调用传入的chars方法对text进行处理
      }
    } else {
      let endTagLength = 0
      const stackedTag = lastTag.toLowerCase()
      // 拿到标签里面的内容的正则（此次做了一个缓存的优化减少了new RegExp使用）
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        endTagLength = endTag.length
        // 不是script、style、textarea、noscript标签
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          // 把text内容替换的注释的文本替换掉
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        // 如果忽略换行然后切了一个字符（？？）
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1)
        }
        if (options.chars) {
          options.chars(text) // 对text进行处理 
        }
        return ''
      })
      // 修改index和html
      index += html.length - rest.length
      html = rest
      // 解析结束标签作用？？
      parseEndTag(stackedTag, index - endTagLength, index)
    }

    // 模板末尾的标记格式错误
    if (html === last) {
      options.chars && options.chars(html)
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`)
      }
      break
    }
  }

  // Clean up any remaining tags --> 清除所有剩余的标签
  parseEndTag()

  // 当指针或者游标一样理解，移动多少个多少位置
  function advance (n) {
    index += n
    html = html.substring(n)
  }

  /** 解析开始标签以及提取内容 */
  function parseStartTag () {
    const start = html.match(startTagOpen)
    // 解析出开始标签
    if (start) {
      // 存放标签信息的变量
      const match = {
        tagName: start[1],
        attrs: [],
        start: index
      }
      advance(start[0].length) // 移动到标签后
      let end, attr
      // 不是标签的结尾而且解析attr属性 （进行移动下标并且向attrsArr中push内容）
      while (!(end = html.match(startTagClose)) && (attr = html.match(attribute))) {
        advance(attr[0].length)
        match.attrs.push(attr)
      }
      if (end) {
        match.unarySlash = end[1] //一元斜杠
        // 移动下标、记录end下标、并返回结果
        advance(end[0].length)
        match.end = index
        return match
      }
    }
  }

  /** 解析标签内的属性内容 并调用start函数*/
  function handleStartTag (match) {
    const tagName = match.tagName
    const unarySlash = match.unarySlash

    /** 为什么满足这些条件就要解析闭合标签？（？？） */
    if (expectHTML) {
      // lastTag是p而且是非短语标记
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        parseEndTag(lastTag)
      }
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
    }

    const unary = isUnaryTag(tagName) || !!unarySlash // 一元标签

    const l = match.attrs.length
    const attrs = new Array(l)
    // attrs的处理（规范化和标准化）
    for (let i = 0; i < l; i++) {
      const args = match.attrs[i]
      // hackish work around FF bug https://bugzilla.mozilla.org/show_bug.cgi?id=369778
      if (IS_REGEX_CAPTURING_BROKEN && args[0].indexOf('""') === -1) {
        // 对火狐的bug的处理
        if (args[3] === '') { delete args[3] }
        if (args[4] === '') { delete args[4] }
        if (args[5] === '') { delete args[5] }
      }
      const value = args[3] || args[4] || args[5] || '' //拿到有效值
      // 对a标签转译的处理
      const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href'
        ? options.shouldDecodeNewlinesForHref
        : options.shouldDecodeNewlines
      attrs[i] = { // 组装后正确的值
        name: args[1],
        value: decodeAttr(value, shouldDecodeNewlines)
      }
    }

    if (!unary) {
      // 不是一元标签向栈推入内容 
      stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs })
      lastTag = tagName // 终于看到修改lastTag（原来用来记录最后一次编译的tag）
    }

    // 调用传入的start函数
    if (options.start) {
      options.start(tagName, attrs, unary, match.start, match.end)
    }
  }

  /** 解析结束标签
   *  ×××理解出栈的运行×××
   */
  function parseEndTag (tagName, start, end) {
    let pos, lowerCasedTagName
    if (start == null) start = index
    if (end == null) end = index

    if (tagName) {
      lowerCasedTagName = tagName.toLowerCase()
    }

    // Find the closest opened tag of the same type
    // 查找同一类型最近打开的标记
    if (tagName) {
      for (pos = stack.length - 1; pos >= 0; pos--) {
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break
        }
      }
    } else {
      // If no tag name is provided, clean shop
      // 如果没有提供标签名称，清洁工厂
      pos = 0
    }

    if (pos >= 0) {
      // Close all the open elements, up the stack
      // 关闭所有打开的元素，并且出栈
      for (let i = stack.length - 1; i >= pos; i--) {
        // (i > pos || !tagName) 没有找到正确的闭合
        if (process.env.NODE_ENV !== 'production' &&
          (i > pos || !tagName) &&
          options.warn
        ) {
          options.warn(
            `tag <${stack[i].tag}> has no matching end tag.`
          )
        }
        // 调用end标签的方法
        if (options.end) {
          options.end(stack[i].tag, start, end)
        }
      }

      // Remove the open elements from the stack
      // 从堆栈中移除元素
      stack.length = pos
      lastTag = pos && stack[pos - 1].tag
    } else if (lowerCasedTagName === 'br') { // 一元标签br的特殊处理
      if (options.start) {
        options.start(tagName, [], true, start, end)
      }
    // 为什么这里要特殊处理p呢？？
    } else if (lowerCasedTagName === 'p') {
      if (options.start) {
        options.start(tagName, [], false, start, end)
      }
      if (options.end) {
        options.end(tagName, start, end)
      }
    }
  }
}
