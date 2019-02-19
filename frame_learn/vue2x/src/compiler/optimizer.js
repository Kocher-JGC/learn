/* @flow */

import { makeMap, isBuiltInTag, cached, no } from 'shared/util'

let isStaticKey
let isPlatformReservedTag

const genStaticKeysCached = cached(genStaticKeys) // 创建一个函数的缓存调用结果

/**
 * Goal of the optimizer: walk the generated template AST tree
 * and detect sub-trees that are purely static, i.e. parts of
 * the DOM that never needs to change.
 * 优化器的目标：遍历生成的模板ast树并检测纯静态的子树，即不需要更改的DOM部分。
 * 
 * Once we detect these sub-trees, we can:
 *
 * 1. Hoist them into constants, so that we no longer need to
 *    create fresh nodes for them on each re-render;
 * 2. Completely skip them in the patching process.
 * 
 * 一旦我们检测到这些子树，我们就可以：
 * 1、将它们提升为常量，这样我们就不再需要在每次重新渲染时为它们创建新的节点；
 * 2、在更新（修补）过程中完全跳过它们。
 */
export function optimize (root: ?ASTElement, options: CompilerOptions) {
  if (!root) return
  // 该文件的全局变量（提升options变量以便该局部全局使用）
  isStaticKey = genStaticKeysCached(options.staticKeys || '') // 静态key（包含检查外部传入的静态key）
  isPlatformReservedTag = options.isReservedTag || no  // 平台的保留标签（原生标签）
  // first pass: mark all non-static nodes. 第一遍：标记所有非静态节点。
  markStatic(root)
  // second pass: mark static roots. 标记静态根
  markStaticRoots(root, false)
}

/** 创建静态key */
function genStaticKeys (keys: string): Function {
  return makeMap(
    'type,tag,attrsList,attrsMap,plain,parent,children,attrs' +
    (keys ? ',' + keys : '')
  )
}

function markStatic (node: ASTNode) {
  node.static = isStatic(node) // 先判断是否静态节点
  if (node.type === 1) { // node是一个标签[element]进行以下处理
    // do not make component slot content static. this avoids
    // 1. components not able to mutate slot nodes
    // 2. static slot content fails for hot-reloading
    /** 不要将组件插槽内容设为静态。这避免了
     * 1、无法改变插槽节点的组件
     * 2、静态插槽内容无法进行（hot-reloading）热重新加载
     */
    if (
      !isPlatformReservedTag(node.tag) && // 不是平台保留标签(此处为传入的options调用的函数)
      node.tag !== 'slot' && // 不是solt
      node.attrsMap['inline-template'] == null // 属性中inline-template的值为空
    ) {
      return
    }
    // 循环children进行标记是否为静态节点（该递归的好处是由子到父，只要某一个子级不为静态则父级也不为静态）
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i]
      markStatic(child)
      if (!child.static) {
        node.static = false
      }
    }
    // 对含有if条件的节点的处理
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block
        markStatic(block)
        if (!block.static) {
          node.static = false
        }
      }
    }
  }
}

function markStaticRoots (node: ASTNode, isInFor: boolean) {
  if (node.type === 1) { // node是一个标签[element]进行以下处理
    if (node.static || node.once) { // 静态节点或者是一次的节点
      node.staticInFor = isInFor // （这个标记有什么用？？）
    }
    // For a node to qualify as a static root, it should have children that
    // are not just static text. Otherwise the cost of hoisting out will
    // outweigh the benefits and it's better off to just always render it fresh.
    // 对于要限定为静态根的节点，它应该有不只是静态文本的子级。否则，弊大于利，最好总是新的渲染刷新。
    if (node.static && node.children.length && !(
      node.children.length === 1 &&
      node.children[0].type === 3
    )) { // 静态节点而且子节点只有一个文本节点，则标志静态根
      node.staticRoot = true
      return
    } else {
      node.staticRoot = false
    }
    // 对Children进行静态根处理
    if (node.children) {
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }
    // 对含有if条件的节点进行静态根处理
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor)
      }
    }
  }
}

function isStatic (node: ASTNode): boolean {
  /** 在parse阶段的理解可以知道 
   * type = 2 是（插值表达式节点含有变量的）
   * type = 3 是text或者comment节点（都是静态的）
   */
  if (node.type === 2) { // expression
    return false
  }
  if (node.type === 3) { // text
    return true
  }
  // 如果pre属性为true或者满足以下5个条件可以确定该节点为静态节点
  return !!(node.pre || (
    /** 
     * 1、无动态绑定数据、if、for、
     * 2、检查标记是否为内置标记。标签形如[slot,component]
     * 3、必定是HTML原生标签（不是组件）
     * 4、是否为template的子级
     * 5、并且node的所有key都是静态key
     * 都满足的情况为true*/
    !node.hasBindings && // no dynamic bindings
    !node.if && !node.for && // not v-if or v-for or v-else
    !isBuiltInTag(node.tag) && // not a built-in
    isPlatformReservedTag(node.tag) && // not a component
    !isDirectChildOfTemplateFor(node) &&
    Object.keys(node).every(isStaticKey)
  ))
}

/** 是否为template的子级（return false）或者是for的子级（return true）
 * 一直往上查找
 * 直到找到tag ！== template --> 返回false
 * 或者找到该父级是for循环体 -->  返回true
 * 找完了上面2个无一满足 --> 返回false
 */
function isDirectChildOfTemplateFor (node: ASTElement): boolean {
  while (node.parent) {
    node = node.parent
    if (node.tag !== 'template') {
      return false
    }
    if (node.for) {
      return true
    }
  }
  return false
}
