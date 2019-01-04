/**
 * Virtual DOM patching algorithm based on Snabbdom by
 * Simon Friis Vindum (@paldepind)
 * Licensed under the MIT License
 * https://github.com/paldepind/snabbdom/blob/master/LICENSE
 *
 * modified by Evan You (@yyx990803)
 *
 * Not type-checking this because this file is perf-critical and the cost
 * of making flow understand it is not worth it.
 *
 * 用了很多递归好好学习其思维和技巧
 *
 * 注意：
 * 1、有时候先调用cbs的再调用vnode的，有时候反过来。注意逻辑
 * 2、一个i贯彻全函数
 * 3、哪个变量啥的是没有的
 */

import VNode, { cloneVNode } from './vnode'
import config from '../config'
import { SSR_ATTR } from 'shared/constants'
import { registerRef } from './modules/ref'
import { traverse } from '../observer/traverse'
import { activeInstance } from '../instance/lifecycle'
import { isTextInputType } from 'web/util/element'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  makeMap,
  isRegExp,
  isPrimitive
} from '../util/index'

export const emptyNode = new VNode('', {}, [])

const hooks = ['create', 'activate', 'update', 'remove', 'destroy']

function sameVnode (a, b) {
  return (
    // key 相等 || （tag/是否注释节点/data是否定义/是否相同的输入）
    a.key === b.key && (
      (
        a.tag === b.tag &&
        a.isComment === b.isComment &&
        isDef(a.data) === isDef(b.data) &&
        sameInputType(a, b)
      ) || (
        // 是否异步的占位符节点 且 异步工厂 且异步工厂的错误没有定义
        isTrue(a.isAsyncPlaceholder) &&
        a.asyncFactory === b.asyncFactory &&
        isUndef(b.asyncFactory.error)
      )
    )
  )
}
/**
 * 用i很好的起到中间作用
 * data定义==>attrs定义==>type
 * input 类型相等 而且是文本输入的类型（text,number,password,search,email,tel,url）
 *  **/
function sameInputType (a, b) {
  if (a.tag !== 'input') return true
  let i
  const typeA = isDef(i = a.data) && isDef(i = i.attrs) && i.type
  const typeB = isDef(i = b.data) && isDef(i = i.attrs) && i.type
  return typeA === typeB || isTextInputType(typeA) && isTextInputType(typeB)
}

function createKeyToOldIdx (children, beginIdx, endIdx) {
  let i, key
  const map = {}
  for (i = beginIdx; i <= endIdx; ++i) {
    key = children[i].key
    if (isDef(key)) map[key] = i
  }
  return map
}

/** 巧妙利用函数的柯里化 根据平台的不一样 、利用闭包的特性储存（属性、方法） **/
/**×× 巧妙的利用闭包的作用域关系，存储对应的私有且特定的作用域变量且控制变量的变化 ××**/
export function createPatchFunction (backend) {
  let i, j
  const cbs = {}

  const { modules, nodeOps } = backend

  /** 钩子函数的处理 **/
  for (i = 0; i < hooks.length; ++i) {
    cbs[hooks[i]] = []
    for (j = 0; j < modules.length; ++j) {
      if (isDef(modules[j][hooks[i]])) {
        cbs[hooks[i]].push(modules[j][hooks[i]])
      }
    }
  }

  function emptyNodeAt (elm) {
    return new VNode(nodeOps.tagName(elm).toLowerCase(), {}, [], undefined, elm)
  }

  /** 组装remove函数，记录监听者 === 0 调用removeNode移除 **/
  /** 思考：什么意思、有什么作用？ 注意查看listeners的变化**/
  function createRmCb (childElm, listeners) {
    function remove () {
      if (--remove.listeners === 0) {
        removeNode(childElm)
      }
    }
    remove.listeners = listeners
    return remove
  }

  /** 找到该元素的父级再删除 **/
  function removeNode (el) {
    const parent = nodeOps.parentNode(el)
    // element may have already been removed due to v-html / v-text
    // 由于v-html/v-text，元素可能已被删除
    if (isDef(parent)) {
      nodeOps.removeChild(parent, el)
    }
  }

  /** 是否未知节点 **/
  function isUnknownElement (vnode, inVPre) {
    return (
      !inVPre &&
      !vnode.ns && // 没有命名空间
      !(
        config.ignoredElements.length &&
        // 是否忽略的元素
        config.ignoredElements.some(ignore => {
          return isRegExp(ignore)
            ? ignore.test(vnode.tag)
            : ignore === vnode.tag
        })
      ) &&
      // 在web平台中不能通过document.createElement创建的元素
      config.isUnknownElement(vnode.tag)
    )
  }

  let creatingElmInVPre = 0

  function createElm (
    vnode,
    insertedVnodeQueue, // 存在于整个patch中，用于收集patch中插入的vnode;
    parentElm,
    refElm,
    nested,
    /** createChildern 会传入这两个参数**/
    ownerArray,
    index
  ) {
    if (isDef(vnode.elm) && isDef(ownerArray)) {
      // This vnode was used in a previous render!
      // now it's used as a new node, overwriting its elm would cause
      // potential patch errors down the road when it's used as an insertion
      // reference node. Instead, we clone the node on-demand before creating
      // associated DOM element for it.
      // 这个Vnode在以前的渲染中使用过！
      // 现在它被用作一个新的节点，当它被用作插入引用节点时，覆盖它的ELM会导致潜在的补丁错误。
      // 相反，我们在创建关联的DOM元素。
      /** 既然是children创建传入的那么产生这些关联有何用，解决什么问题 **/
      vnode = ownerArray[index] = cloneVNode(vnode) // new 一个 Vnode 然后并赋值属性
    }

    vnode.isRootInsert = !nested // for transition enter check // 对于转换输入检查
    // 有data定义和是componentInstance就去实例component和插入真实dom
    if (createComponent(vnode, insertedVnodeQueue, parentElm, refElm)) {
      return
    }

    // 存储数据、children、tag
    const data = vnode.data
    const children = vnode.children
    const tag = vnode.tag
    // 有tag 开发环境检验该组件是否注册
    if (isDef(tag)) {
      if (process.env.NODE_ENV !== 'production') {
        if (data && data.pre) {
          creatingElmInVPre++
        }
        if (isUnknownElement(vnode, creatingElmInVPre)) {
          warn(
            'Unknown custom element: <' + tag + '> - did you ' +
            'register the component correctly? For recursive components, ' +
            'make sure to provide the "name" option.',
            vnode.context
          )
        }
      }

      vnode.elm = vnode.ns
        ? nodeOps.createElementNS(vnode.ns, tag) // 创建NS有什么用兼容什么
        : nodeOps.createElement(tag, vnode) // 创建 真实的DOM（包含自定义标签的DOM）
      setScope(vnode) // 设置attr scope

      /* istanbul ignore if */
      // createChildren 会递归调用createElm
      if (__WEEX__) {
        // in Weex, the default inserti on order is parent-first.
        // List items can be optimized to use children-first insertion
        // with append="tree".
        // 在weex中，默认插入顺序是parent first。
        // 使用append =“tree”可以优化列表项以使用子项首次插入。
        const appendAsTree = isDef(data) && isTrue(data.appendAsTree)
        // 根据 appendAsTree 先 createChildren还是后创建 // 主要决定顺序
        // 先调用钩子和插入后创建
        if (!appendAsTree) {
          if (isDef(data)) {
            invokeCreateHooks(vnode, insertedVnodeQueue)
          }
          insert(parentElm, vnode.elm, refElm)
        }
        createChildren(vnode, children, insertedVnodeQueue)
        // 先创建后调用钩子和插入
        if (appendAsTree) {
          if (isDef(data)) {
            invokeCreateHooks(vnode, insertedVnodeQueue)
          }
          insert(parentElm, vnode.elm, refElm)
        }
      } else {
        // 先创建后调用钩子和插入
        createChildren(vnode, children, insertedVnodeQueue)
        if (isDef(data)) {
          invokeCreateHooks(vnode, insertedVnodeQueue)
        }
        insert(parentElm, vnode.elm, refElm)
      }

      // 又减回去
      if (process.env.NODE_ENV !== 'production' && data && data.pre) {
        creatingElmInVPre--
      }
      // 注释节点insertComment
    } else if (isTrue(vnode.isComment)) {
      vnode.elm = nodeOps.createComment(vnode.text)
      insert(parentElm, vnode.elm, refElm)
    } else {
      // insertTextNode
      vnode.elm = nodeOps.createTextNode(vnode.text)
      insert(parentElm, vnode.elm, refElm)
    }
  }

  function createComponent (vnode, insertedVnodeQueue, parentElm, refElm) {
    let i = vnode.data
    // 有数据定义 检查和调用init钩子
    if (isDef(i)) {
      // 是一个组件实例而且 keepAlive ==> 标记重新激活
      const isReactivated = isDef(vnode.componentInstance) && i.keepAlive
      // 钩子定义 而且 钩子中的init方法定义 调用 init 传入vnode
      if (isDef(i = i.hook) && isDef(i = i.init)) {
        i(vnode, false /* hydrating */)
      }
      // after calling the init hook, if the vnode is a child component
      // it should've created a child instance and mounted it. the child
      // component also has set the placeholder vnode's elm.
      // in that case we can just return the element and be done.
      // 在调用init hook之后，如果vnode是子组件，那么它应该创建一个子实例并装入它。
      // 子组件还设置了占位符vnode的elm。在这种情况下，我们只需返回元素并完成。
      /** 确定是组件的实例以后 执行init 和创建 **/
      if (isDef(vnode.componentInstance)) {
        // 初始化组件 ==> 向insertedVnodeQueue push vnode
        initComponent(vnode, insertedVnodeQueue)
        insert(parentElm, vnode.elm, refElm) // 插入真实的dom
        if (isTrue(isReactivated)) {
          // 重新激活组件
          reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm)
        }
        return true
      }
    }
  }

  function initComponent (vnode, insertedVnodeQueue) {
    // 如果vnode未插入 则在insertedVnodeQueue push vnode.data.pendingInsert
    if (isDef(vnode.data.pendingInsert)) {
      insertedVnodeQueue.push.apply(insertedVnodeQueue, vnode.data.pendingInsert)
      vnode.data.pendingInsert = null
    }
    // 拿到组件实例下的$el
    vnode.elm = vnode.componentInstance.$el
    /** 可服用的，调用创建钩子，设置scope **/
    if (isPatchable(vnode)) {
      invokeCreateHooks(vnode, insertedVnodeQueue)
      setScope(vnode)
    } else {
      // empty component root. // 空根组件
      // 跳过除ref以外的所有与元素相关的模块 （修复issues）
      // skip all element-related modules except for ref (#3455)
      registerRef(vnode)
      // make sure to invoke the insert hook
      // 确保插入调用的钩子
      insertedVnodeQueue.push(vnode)
    }
  }

  function reactivateComponent (vnode, insertedVnodeQueue, parentElm, refElm) {
    let i
    // hack for #4339: a reactivated component with inner transition
    // does not trigger because the inner node's created hooks are not called
    // again. It's not ideal to involve module-specific logic in here but
    // there doesn't seem to be a better way to do it.
    // 具有内部转换的重新激活组件不会触发，因为内部节点创建的钩子不会再次调用。
    // 在这里涉及模块特定逻辑并不理想，但似乎没有更好的方法。
    let innerNode = vnode
    while (innerNode.componentInstance) {
      innerNode = innerNode.componentInstance._vnode
      // 如果组件实例的父级 的data和transition存在
      if (isDef(i = innerNode.data) && isDef(i = i.transition)) {
        // 主动循环调用激活钩子函数
        for (i = 0; i < cbs.activate.length; ++i) {
          cbs.activate[i](emptyNode, innerNode)
        }
        // push innerNode（递归到的某一个父级） 到 insertedVnodeQueue
        insertedVnodeQueue.push(innerNode)
        break
      }
    }
    // unlike a newly created component,
    // a reactivated keep-alive component doesn't insert itself
    insert(parentElm, vnode.elm, refElm)
  }

  /** 插入真实的dom 思考：这样设计有什么好处 **/
  function insert (parent, elm, ref) {
    // 不存在父节点，没有插入的地方
    if (isDef(parent)) {
      if (isDef(ref)) {
        // 定义了参考节点 且节点的父级是 传入的父级则插入参考节点之前
        /**  思考：如果不同父级则不插入？为何如此设计？（是不是防止不必要错误？） **/
        if (ref.parentNode === parent) {
          nodeOps.insertBefore(parent, elm, ref)
        }
      } else {
        nodeOps.appendChild(parent, elm) // 没有则append
      }
    }
  }

  function createChildren (vnode, children, insertedVnodeQueue) {
    // 如果children是一个数组循环调用createElm创建子DOM
    if (Array.isArray(children)) {
      if (process.env.NODE_ENV !== 'production') {
        checkDuplicateKeys(children)
      }
      for (let i = 0; i < children.length; ++i) {
        createElm(children[i], insertedVnodeQueue, vnode.elm, null, true, children, i)
      }
      /** 为何要判断：vnode.text是基本类型 **/
    } else if (isPrimitive(vnode.text)) {
      nodeOps.appendChild(vnode.elm, nodeOps.createTextNode(String(vnode.text)))
    }
  }

  /** 是否可修复的  递归查找顶级_vnode 的 tag 判断是否定义 **/
  function isPatchable (vnode) {
    while (vnode.componentInstance) {
      vnode = vnode.componentInstance._vnode
    }
    return isDef(vnode.tag)
  }

  /** 调用创建钩子
   * 循环cbs.create 调用 create
   * **/
  function invokeCreateHooks (vnode, insertedVnodeQueue) {
    for (let i = 0; i < cbs.create.length; ++i) {
      cbs.create[i](emptyNode, vnode)
    }
    // 变量复用做得好
    i = vnode.data.hook // Reuse variable
    if (isDef(i)) { // 调用完cbs 的再 调用 vnode 的create 和push insertedVnodeQueue
      if (isDef(i.create)) i.create(emptyNode, vnode)
      /** insertedVnodeQueue 作用  ??**/
      if (isDef(i.insert)) insertedVnodeQueue.push(vnode)
    }
  }

  // set scope id attribute for scoped CSS.
  // this is implemented as a special case to avoid the overhead
  // of going through the normal attribute patching process.
  // 设置作用域CSS的作用域ID属性。
  // 这是作为一种特殊情况实现的，以避免通过常规属性修补过程的开销。
  // 设置style 上的 scope属性
  function setScope (vnode) {
    let i
    // fnScopeId 存在直接设置
    if (isDef(i = vnode.fnScopeId)) {
      nodeOps.setStyleScope(vnode.elm, i)
    } else {
      let ancestor = vnode
      // 递归查找设置 scopedSlots
      while (ancestor) {
        if (isDef(i = ancestor.context) && isDef(i = i.$options._scopeId)) {
          nodeOps.setStyleScope(vnode.elm, i)
        }
        ancestor = ancestor.parent
      }
    }
    // for slot content they should also get the scopeId from the host instance.
    // 对于槽内容，它们还应该从主机实例中获取scopeid。
    if (isDef(i = activeInstance) && // 活跃的实例
      i !== vnode.context && // vnode的不是上下文
      i !== vnode.fnContext && // 不是 vnode的fnContext
      isDef(i = i.$options._scopeId) // _scopeid没有定义
    ) {
      nodeOps.setStyleScope(vnode.elm, i)
    }
  }

  /** 直接循环添加多个Elm **/
  /** 思考： （在createElement的时候把children铺平，再这里创建一定范围的elm是不是一种体现） **/
  function addVnodes (parentElm, refElm, vnodes, startIdx, endIdx, insertedVnodeQueue) {
    for (; startIdx <= endIdx; ++startIdx) {
      createElm(vnodes[startIdx], insertedVnodeQueue, parentElm, refElm, false, vnodes, startIdx)
    }
  }

  /** 调用销毁钩子 **/
  function invokeDestroyHook (vnode) {
    let i, j
    const data = vnode.data
    if (isDef(data)) {
      // 调用vnode中的destroy钩子和 //cbs中的销毁钩子
      if (isDef(i = data.hook) && isDef(i = i.destroy)) i(vnode)
      for (i = 0; i < cbs.destroy.length; ++i) cbs.destroy[i](vnode)
    }
    // 递归销毁子vnode
    if (isDef(i = vnode.children)) {
      for (j = 0; j < vnode.children.length; ++j) {
        invokeDestroyHook(vnode.children[j])
      }
    }
  }

  /** 移除一定范围的vnode **/
  function removeVnodes (parentElm, vnodes, startIdx, endIdx) {
    for (; startIdx <= endIdx; ++startIdx) {
      const ch = vnodes[startIdx]
      if (isDef(ch)) {
        if (isDef(ch.tag)) { // 含tag的移除
          removeAndInvokeRemoveHook(ch)
          invokeDestroyHook(ch)
        } else { // Text node !!
          removeNode(ch.elm)
        }
      }
    }
  }

  /** 移除和调用移除钩子 **/
  function removeAndInvokeRemoveHook (vnode, rm) {
    if (isDef(rm) || isDef(vnode.data)) {
      let i
      const listeners = cbs.remove.length + 1
      if (isDef(rm)) {
        // we have a recursively passed down rm callback
        // increase the listeners count
        // 我们有一个递归传递的rm回调，增加侦听器计数
        rm.listeners += listeners
      } else {
        // directly removing // 直接移除
        rm = createRmCb(vnode.elm, listeners)
      }
      // recursively invoke hooks on child component root node
      // 如果vnode是一个组件实例，而且父级的data定义，递归调用removeAndInvokeRemoveHook移除
      if (isDef(i = vnode.componentInstance) && isDef(i = i._vnode) && isDef(i.data)) {
        removeAndInvokeRemoveHook(i, rm)
      }
      /** 注意这里是先递归后循环所以调用是从父到子**/
      /** 循环调用cbs的移除方法  **/
      for (i = 0; i < cbs.remove.length; ++i) {
        cbs.remove[i](vnode, rm)
      }
      // 再调用 vnode 上的remove
      if (isDef(i = vnode.data.hook) && isDef(i = i.remove)) {
        i(vnode, rm)
      } else {
        /** 来到这里有要思考为什么rm要提前生成（而且还有计数的） **/
        rm() // vnode上无removeHook 直接调用先前生成的 rm
      }
    } else {
      removeNode(vnode.elm) // 普通/文本/注释等节点直接移除
    }
  }

  function updateChildren (parentElm, oldCh, newCh, insertedVnodeQueue, removeOnly) {
    let oldStartIdx = 0
    let newStartIdx = 0
    let oldEndIdx = oldCh.length - 1
    let oldStartVnode = oldCh[0]
    let oldEndVnode = oldCh[oldEndIdx]
    let newEndIdx = newCh.length - 1
    let newStartVnode = newCh[0]
    let newEndVnode = newCh[newEndIdx]
    let oldKeyToIdx, idxInOld, vnodeToMove, refElm

    // removeOnly is a special flag used only by <transition-group>
    // to ensure removed elements stay in correct relative positions
    // during leaving transitions
    // removeOnly是一个特殊的标志，仅由<transition-group>使用，
    // 以确保删除的元素在离开转换期间保持正确的相对位置。
    const canMove = !removeOnly

    if (process.env.NODE_ENV !== 'production') {
      checkDuplicateKeys(newCh)
    }

    /** 不同类型的更新后面再研究 **/
    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      if (isUndef(oldStartVnode)) {
        oldStartVnode = oldCh[++oldStartIdx] // Vnode has been moved left
      } else if (isUndef(oldEndVnode)) {
        oldEndVnode = oldCh[--oldEndIdx]
      } else if (sameVnode(oldStartVnode, newStartVnode)) {
        patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue)
        oldStartVnode = oldCh[++oldStartIdx]
        newStartVnode = newCh[++newStartIdx]
      } else if (sameVnode(oldEndVnode, newEndVnode)) {
        patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue)
        oldEndVnode = oldCh[--oldEndIdx]
        newEndVnode = newCh[--newEndIdx]
      } else if (sameVnode(oldStartVnode, newEndVnode)) { // Vnode moved right
        patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue)
        canMove && nodeOps.insertBefore(parentElm, oldStartVnode.elm, nodeOps.nextSibling(oldEndVnode.elm))
        oldStartVnode = oldCh[++oldStartIdx]
        newEndVnode = newCh[--newEndIdx]
      } else if (sameVnode(oldEndVnode, newStartVnode)) { // Vnode moved left
        patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue)
        canMove && nodeOps.insertBefore(parentElm, oldEndVnode.elm, oldStartVnode.elm)
        oldEndVnode = oldCh[--oldEndIdx]
        newStartVnode = newCh[++newStartIdx]
      } else {
        if (isUndef(oldKeyToIdx)) oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx)
        idxInOld = isDef(newStartVnode.key)
          ? oldKeyToIdx[newStartVnode.key]
          : findIdxInOld(newStartVnode, oldCh, oldStartIdx, oldEndIdx)
        if (isUndef(idxInOld)) { // New element
          createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm, false, newCh, newStartIdx)
        } else {
          vnodeToMove = oldCh[idxInOld]
          if (sameVnode(vnodeToMove, newStartVnode)) {
            patchVnode(vnodeToMove, newStartVnode, insertedVnodeQueue)
            oldCh[idxInOld] = undefined
            canMove && nodeOps.insertBefore(parentElm, vnodeToMove.elm, oldStartVnode.elm)
          } else {
            // same key but different element. treat as new element
            createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm, false, newCh, newStartIdx)
          }
        }
        newStartVnode = newCh[++newStartIdx]
      }
    }
    if (oldStartIdx > oldEndIdx) {
      refElm = isUndef(newCh[newEndIdx + 1]) ? null : newCh[newEndIdx + 1].elm
      addVnodes(parentElm, refElm, newCh, newStartIdx, newEndIdx, insertedVnodeQueue)
    } else if (newStartIdx > newEndIdx) {
      removeVnodes(parentElm, oldCh, oldStartIdx, oldEndIdx)
    }
  }

  /** 检查重复键 疑问：检查children的key重复？？ 难道是v-for的？ **/
  function checkDuplicateKeys (children) {
    const seenKeys = {}
    for (let i = 0; i < children.length; i++) {
      const vnode = children[i]
      const key = vnode.key
      if (isDef(key)) {
        if (seenKeys[key]) {
          warn(
            `Duplicate keys detected: '${key}'. This may cause an update error.`,
            vnode.context
          )
        } else {
          seenKeys[key] = true
        }
      }
    }
  }

  /** 在旧的Ch查找（Ch是什么？？应该是oldChildren） **/
  function findIdxInOld (node, oldCh, start, end) {
    for (let i = start; i < end; i++) {
      const c = oldCh[i]
      if (isDef(c) && sameVnode(node, c)) return i
    }
  }

  function patchVnode (oldVnode, vnode, insertedVnodeQueue, removeOnly) {
    if (oldVnode === vnode) { // 新旧vnode相同
      return
    }

    // 新的elm引用旧的elm ？？
    const elm = vnode.elm = oldVnode.elm

    // oldVnode是一个异步占位符   必然return
    if (isTrue(oldVnode.isAsyncPlaceholder)) {
      // 异步工厂已经定义 调用 hydrate
      if (isDef(vnode.asyncFactory.resolved)) {
        // 异步工厂调用的，但是不理解有什么用处
        hydrate(oldVnode.elm, vnode, insertedVnodeQueue)
      } else {
        vnode.isAsyncPlaceholder = true // 新的vnode也是一个异步占位符节点
      }
      return
    }

    // reuse element for static trees.
    // note we only do this if the vnode is cloned -
    // if the new node is not cloned it means the render functions have been
    // reset by the hot-reload-api and we need to do a proper re-render.
    /** 为静态树重用元素。
        注意，我们只在克隆vnode时执行此操作-
        如果没有克隆新节点，则表示渲染函数已由热重新加载API重置，我们需要进行适当的重新渲染
    **/
    // 新旧都是静态的、key相同、新的是克隆的、新的是单次渲染的 ==> 成立以上条件直接赋值组件实例
    if (isTrue(vnode.isStatic) &&
      isTrue(oldVnode.isStatic) &&
      vnode.key === oldVnode.key &&
      (isTrue(vnode.isCloned) || isTrue(vnode.isOnce))
    ) {
      vnode.componentInstance = oldVnode.componentInstance
      return
    }

    let i
    const data = vnode.data
    // prepatch钩子定义  调用
    if (isDef(data) && isDef(i = data.hook) && isDef(i = i.prepatch)) {
      i(oldVnode, vnode)
    }

    // 拿到children
    const oldCh = oldVnode.children
    const ch = vnode.children
    // 有data 且顶级是vnode含有tag ==> 调用cbs更新再调用vnode的更新
    if (isDef(data) && isPatchable(vnode)) {
      for (i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode)
      if (isDef(i = data.hook) && isDef(i = i.update)) i(oldVnode, vnode)
    }
    if (isUndef(vnode.text)) {
      if (isDef(oldCh) && isDef(ch)) {
        // 新旧都有而且不一样  更新 (反之一样不变)
        if (oldCh !== ch) updateChildren(elm, oldCh, ch, insertedVnodeQueue, removeOnly)
      } else if (isDef(ch)) {
        // 新的有定义 添加新的 （而且要把旧的稳步节点删除）
        /** （此处为何这样做要研究他的DOM）（是因为他是旧的children么） **/
        if (isDef(oldVnode.text)) nodeOps.setTextContent(elm, '')
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue)
      } else if (isDef(oldCh)) {
        // 有旧的没有新的 删除
        removeVnodes(elm, oldCh, 0, oldCh.length - 1)
      } else if (isDef(oldVnode.text)) {
        // 如果有text，那就更新text
        /** 思考：其他更新的text如何跟着更新 **/
        nodeOps.setTextContent(elm, '')
      }
    } else if (oldVnode.text !== vnode.text) { // 文本不一样直接更新文本
      nodeOps.setTextContent(elm, vnode.text)
    }
    // 最后调用postpatch钩子
    if (isDef(data)) {
      if (isDef(i = data.hook) && isDef(i = i.postpatch)) i(oldVnode, vnode)
    }
  }

  /** 调用插入钩子 **/
  function invokeInsertHook (vnode, queue, initial) {
    // delay insert hooks for component root nodes, invoke them after the
    // element is really inserted
    // 延迟组件根节点的插入挂接，在实际插入元素后调用它们
    if (isTrue(initial) && isDef(vnode.parent)) {
      // 延迟组件此处做记录
      vnode.parent.data.pendingInsert = queue
    } else {
      // 正常的直接调用insert钩子
      for (let i = 0; i < queue.length; ++i) {
        queue[i].data.hook.insert(queue[i])
      }
    }
  }

  let hydrationBailed = false
  // list of modules that can skip create hook during hydration because they
  // are already rendered on the client or has no need for initialization
  // Note: style is excluded because it relies on initial clone for future
  // deep updates (#7063).
  const isRenderedModule = makeMap('attrs,class,staticClass,staticStyle,key')

  // Note: this is a browser-only function so we can assume elms are DOM nodes.
  // 这是一个仅用于浏览器的函数，因此我们可以假设ELM是DOM节点。
  /** 这个函数不是很清楚用来干什么 **/
  function hydrate (elm, vnode, insertedVnodeQueue, inVPre) {
    let i
    const { tag, data, children } = vnode
    inVPre = inVPre || (data && data.pre)
    vnode.elm = elm

    // 如果是一个注释节点而且是一个异步工厂 那么他就是一个 异步的占位符节点
    if (isTrue(vnode.isComment) && isDef(vnode.asyncFactory)) {
      vnode.isAsyncPlaceholder = true
      return true
    }
    // assert node match // 开发环境下进行断言节点检查
    if (process.env.NODE_ENV !== 'production') {
      if (!assertNodeMatch(elm, vnode, inVPre)) {
        return false
      }
    }
    if (isDef(data)) {
      // data && hook && init 存在 调用 init
      if (isDef(i = data.hook) && isDef(i = i.init)) i(vnode, true /* hydrating */)
      if (isDef(i = vnode.componentInstance)) { // 如果是一个组件实例 // 这里的i赋值，无作用
        // child component. it should have hydrated its own tree.
        // 这英文什么意思
        // 初始化组件并返回
        initComponent(vnode, insertedVnodeQueue)
        return true
      }
    }
    // tag 没有定义 elm.data = vnode.text
    if (isDef(tag)) {
      if (isDef(children)) {
        // empty element, allow client to pick up and populate children
        // 空元素，允许浏览器提取和填充子元素
        if (!elm.hasChildNodes()) { // 当前dom 存在子节点 ==> createChildren
          createChildren(vnode, children, insertedVnodeQueue)
        } else {
          // v-html and domProps: innerHTML
          if (isDef(i = data) && isDef(i = i.domProps) && isDef(i = i.innerHTML)) {
            // vnode的innerHtml和elm的是否一致 ，一致的警告返回false
            if (i !== elm.innerHTML) {
              /* istanbul ignore if */
              if (process.env.NODE_ENV !== 'production' &&
                typeof console !== 'undefined' &&
                !hydrationBailed
              ) {
                hydrationBailed = true
                console.warn('Parent: ', elm)
                console.warn('server innerHTML: ', i)
                console.warn('client innerHTML: ', elm.innerHTML)
              }
              return false
            }
          } else {
            // iterate and compare children lists
            // children递归验证
            let childrenMatch = true
            let childNode = elm.firstChild
            for (let i = 0; i < children.length; i++) {
              if (!childNode || !hydrate(childNode, children[i], insertedVnodeQueue, inVPre)) {
                childrenMatch = false
                break
              }
              childNode = childNode.nextSibling
            }
            // if childNode is not null, it means the actual childNodes list is
            // longer than the virtual children list.
            if (!childrenMatch || childNode) {
              /* istanbul ignore if */
              if (process.env.NODE_ENV !== 'production' &&
                typeof console !== 'undefined' &&
                !hydrationBailed
              ) {
                hydrationBailed = true
                console.warn('Parent: ', elm)
                console.warn('Mismatching childNodes vs. VNodes: ', elm.childNodes, children)
              }
              return false
            }
          }
        }
      }
      if (isDef(data)) {
        let fullInvoke = false
        for (const key in data) {
          // 有数据不属于渲染模型的key调用创建钩子
          if (!isRenderedModule(key)) {
            fullInvoke = true
            invokeCreateHooks(vnode, insertedVnodeQueue)
            break
          }
        }
        if (!fullInvoke && data['class']) {
          // ensure collecting deps for deep class bindings for future updates
          // 确保收集深度类绑定的DEP以备将来更新
          traverse(data['class'])
        }
      }
    } else if (elm.data !== vnode.text) {
      elm.data = vnode.text
    }
    return true
  }

  /** 断言点匹配 **/
  function assertNodeMatch (node, vnode, inVPre) {
    if (isDef(vnode.tag)) { // 是一个标签，而且是一个vue的组件或者（是一个不知道的elm 且 tag的和tagName是一样的）
      return vnode.tag.indexOf('vue-component') === 0 || (
        !isUnknownElement(vnode, inVPre) &&
        vnode.tag.toLowerCase() === (node.tagName && node.tagName.toLowerCase())
      )
    } else {
      // 8是注释节点、3是文本节点 （是否满足）
      return node.nodeType === (vnode.isComment ? 8 : 3)
    }
  }

  return function patch (oldVnode, vnode, hydrating, removeOnly) {
    if (isUndef(vnode)) {
      // 只有旧的 移除
      if (isDef(oldVnode)) invokeDestroyHook(oldVnode)
      return // 没有vnode 走不下去的
    }

    let isInitialPatch = false
    const insertedVnodeQueue = [] // 全局的 、用于收集patch中插入的vnode;

    if (isUndef(oldVnode)) {
      // empty mount (likely as component), create new root element
      isInitialPatch = true
      createElm(vnode, insertedVnodeQueue) // 无旧的新建
    } else {
      const isRealElement = isDef(oldVnode.nodeType)
      // 是DOM节点而且是相同的vnode  ==> patchVNode更新
      if (!isRealElement && sameVnode(oldVnode, vnode)) {
        // patch existing root node
        patchVnode(oldVnode, vnode, insertedVnodeQueue, removeOnly)
      } else {
        // 一切的前提是HtmlNode
        if (isRealElement) {
          // mounting to a real element
          // check if this is server-rendered content and if we can perform
          // a successful hydration.
          // 装载到一个真正的元素，检查这是否是服务器呈现的内容，以及我们是否可以成功地执行水合。
          /** 不是很懂有什么用 **/
          if (oldVnode.nodeType === 1 && oldVnode.hasAttribute(SSR_ATTR)) {
            oldVnode.removeAttribute(SSR_ATTR)
            hydrating = true
          }
          if (isTrue(hydrating)) {
            // 调用那个不知道干嘛的函数，然后调用insert钩子，再返回旧的vnode
            if (hydrate(oldVnode, vnode, insertedVnodeQueue)) {
              invokeInsertHook(vnode, insertedVnodeQueue, true)
              return oldVnode
            } else if (process.env.NODE_ENV !== 'production') {
              /** 这警告的意思？ **/
              warn(
                'The client-side rendered virtual DOM tree is not matching ' +
                'server-rendered content. This is likely caused by incorrect ' +
                'HTML markup, for example nesting block-level elements inside ' +
                '<p>, or missing <tbody>. Bailing hydration and performing ' +
                'full client-side render.'
              )
            }
          }
          // either not server-rendered, or hydration failed.
          // create an empty node and replace it
          // 要么没有服务器渲染，要么水合失败。创建一个空节点并替换它
          oldVnode = emptyNodeAt(oldVnode)
        }

        // replacing existing element // 替换elm
        const oldElm = oldVnode.elm
        const parentElm = nodeOps.parentNode(oldElm) // 拿到旧elm的parent

        // create new node
        createElm( // 然后创建新的
          vnode,
          insertedVnodeQueue,
          // extremely rare edge case: do not insert if old element is in a
          // leaving transition. Only happens when combining transition +
          // keep-alive + HOCs. (#4590)
          oldElm._leaveCb ? null : parentElm,
          nodeOps.nextSibling(oldElm)
        )

        // update parent placeholder node element, recursively
        // 递归的更新父级的占位符节点元素
        if (isDef(vnode.parent)) {
          let ancestor = vnode.parent
          const patchable = isPatchable(vnode) // 顶级有tag的vnode
          while (ancestor) {
            // 调用cbs的销毁钩子
            for (let i = 0; i < cbs.destroy.length; ++i) {
              cbs.destroy[i](ancestor)
            }
            /** 为何这样引用elm？？ **/
            ancestor.elm = vnode.elm
            if (patchable) { // 顶级有tag的vnode 先调用cbs的create
              for (let i = 0; i < cbs.create.length; ++i) {
                cbs.create[i](emptyNode, ancestor)
              }
              // #6513
              // invoke insert hooks that may have been merged by create hooks.
              // e.g. for directives that uses the "inserted" hook.
              // 调用可能已由创建挂钩合并的插入挂钩。
              // 例如，对于使用“inserted”挂钩的指令。
              const insert = ancestor.data.hook.insert
              /** 仔细研究如何出现的 **/
              if (insert.merged) {
                // start at index 1 to avoid re-invoking component mounted hook
                // 从索引1开始，以避免重新调用组件安装的钩子
                for (let i = 1; i < insert.fns.length; i++) {
                  insert.fns[i]()
                }
              }
            } else {
              registerRef(ancestor) //注册ref
            }
            ancestor = ancestor.parent // 赋值循环
          }
        }

        // destroy old node 销毁旧的节点
        if (isDef(parentElm)) {
          removeVnodes(parentElm, [oldVnode], 0, 0)
        } else if (isDef(oldVnode.tag)) {
          invokeDestroyHook(oldVnode)
        }
      }
    }

    // 最后调用insert钩子
    invokeInsertHook(vnode, insertedVnodeQueue, isInitialPatch)
    return vnode.elm
  }
}
