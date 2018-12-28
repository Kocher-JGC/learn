# vue（Runtime+Compiler)

## vue定义

> 1. 如何分模块分步骤Mixin各种属性和方法

1. core/instance/index

   - 定义Vue构造函数

   - ```javascript
     /** 注意都是向prototype中混入 **/
     initMixin(Vue) // 向Vue混入_init方法
     stateMixin(Vue) // 混入数据中心、向Vue混入$data,$props,$set,$delete,$watch
     eventsMixin(Vue) // 混入事件中心,向Vue混入$on,$once,$off,$emit
     lifecycleMixin(Vue) // 混入生命周期，向Vue混入，_update,$forceUpadate,$destroy
     renderMixin(Vue) // 混入渲染的操作函数，向Vue混入，$nextTick,_render,并且安装渲染助手
     /** 渲染helpers有以下方法
      // markOnce
      * _o: (vnode: VNode | Array<VNode>, index: number, key: string) => VNode | VNodeChildren;
      // toNumber
      * _n: (value: string) => number | string;
      // toString
      * _s: (value: mixed) => string;
      // renderList
      * _l: (val: mixed, render: Function) => ?Array<VNode>;
      // renderSlot
      * _t: (name: string, fallback: ?Array<VNode>, props: ?Object) => ?Array<VNode>;
      // loose equal
      * _q: (a: mixed, b: mixed) => boolean;
      // loose indexOf
      * _i: (arr: Array<mixed>, val: mixed) => number;
      // renderStatic
      * _m: (index: number, isInFor?: boolean) => VNode | VNodeChildren;
      // resolveFilter
      * _f: (id: string) => Function;
      // check custom keyCode
      * _k: (eventKeyCode: number, key: string, builtInAlias?: number | Array<number>, eventKeyName?: string) => ?boolean;
      // apply v-bind object
      * _b: (data: any, tag: string, value: any, asProp: boolean, isSync?: boolean) => VNodeData;
      // text to VNode
      * _v: (value: string | number) => VNode;
      // empty vnode
      * _e: () => VNode
      // resolve scoped slots
      * _u: (scopedSlots: ScopedSlotsData, res?: Object) => { [key: string]: Function };
      // apply v-on object
      * _g: (data: any, value: any) => VNodeData;
     **/
     ```

2. core/index

   - initGlobalAPI (挂载util、set、delete、nextTick、options、_base、options.components、use、mixin、extend、assetRegisters)
   - 挂载$isServer和$ssrContext属性
   - 为ssr运行时帮助程序安装公开FunctionalRenderContext 

3. platforms/web/runtime/index.js(挂载平台相关的)

   - ```javascript
     // 配置安装平台相关的设置
     Vue.config.mustUseProp = mustUseProp
     Vue.config.isReservedTag = isReservedTag
     Vue.config.isReservedAttr = isReservedAttr
     Vue.config.getTagNamespace = getTagNamespace
     Vue.config.isUnknownElement = isUnknownElement
     ```

   - 挂载平台相关的directives、和components

   - Vue.prototype.\__patch\_\_ = inBrowser ? patch : noop

   - 挂载$mount方法实际调用mountComponent创建VNode和创建实际DOM

4. platforms/web/entry-runtime-with-compiler.js

   - 修改$mount 方法，用于编译template和compileToFunctions（通过template创建render和staticRender）以及性能埋点

## new Vue（_init(options)）

1. 记录每一个实例的唯一id
2. 开发环境埋点开始
3. 合并配置（initInternalComponent/mergeOptions）
4. 开发环境初始化代理、生产环境渲染代理直接是vm （区别何在？）
5. 储存_self = vm
6. initLifecycle(vm) // 初始化生命周期钩子
7.  initEvents(vm) // 初始化事件中心   
8.  initRender(vm) // 初始化渲染
9.  callHook(vm, 'beforeCreate')
10.  // 解决注入问题？
11. initInjections(vm) // resolve injections before data/props
12. // 初始化 data、props、computed、watcher 等等。
13. initState(vm)
14.  // 解决后提供的数据/props？？
15. initProvide(vm) // resolve provide after data/props
16. callHook(vm, 'created')
17. 埋点结束
18. 如果有el则调用$mount渲染DOM

## $mount挂载vm实例

### $mount

1. 获取原生el
2. render函数不存在的时候
   - 拿到template进行处理
     1. string ==> idToTemplate 获取id对应的ＤＯＭ 的字符串
     2. DOM ==> 直接获取DOM的字符串
     3. template编译失败
     4. 提出疑问直接传入的字符串呢？？
   - 如果有el则直接拿el的DOM字符串作为template
   - 再进行template的处理
     1. 编译埋点开始
     2. 进行render、staticRenderFns的生成
     3. 编译埋点结束
3. 最后调用真正的$moount方法mountComponent

### mountComponent

1. 调用beforeMount钩子
2. 生产环境下直接组装updateComponent = ()=> { vm._update(vm._render(),hydrating) }
3. 开发环境下对vm.render和vm.update的调用进行性能埋点。
4. new Watcher() 实例化监听者 （用于监听数据更新）
   - Watcher
5. 最后记录渲染完成和调用mounted钩子
6. 问题：如果调用到_render来渲染Virtual DOM

## _render方法渲染Virtual DOM

1. vm.$options 获取 render和_parentVnode
2. 开发环境下重置渲染状态（问题为何开发环境要重置？）
3. 获取$scopedSlots 
4. vm.$vnode = _parentVnode;
5. vnode = render.call(vm._renderProxy, vm.$createElement) //渲染virtualDOM
   - render
   - vm._renderProxy
   -  vm.$createElement
6. try错误处理
7. vnode.parent = _parentVNode // set parent
8. return vnode

## 利用 createElement 方法创建 VNode

1. 在createElement函数中规范化数据
2. 实际调用_createElement进行创建
3. 如果是异步（data.is表示异步）的v-bind则返回一个空的VNode
4. 根据normalizationType选择标准化的方式（simpleNormalizeChildren还是normalizeChildren）来标准化children
   - simpleNormalizeChildren
   - normalizeChildren
5. new VNode （如果是Components的时候，运行createComponents进行 new VNode）
6. 最后处理VNode和返回VNode
   1. array ==> 直接返回
   2. vnnode 存在 ==> 调用applyNS、registerDeepBindings ==> 返回vnode
      - applyNS
      - registerDeepBindings
   3. 都不是返回空的vnode

## _update方法把VNode渲染成真实DOM

> 1. 首次渲染调用
> 2. 数据更新调用

1. const prevEl = vm.$el , prevVnode = vm._vnode , prevActiveInstance = activeInstance
   - 记录上一次渲染的el。vnode。和活跃的状态
2. 并保存本次渲染的vnode到vm._vnode
3. 调用__path\_\_真正渲染DOM（\_\_path\_\_实际调用vdom/path.js/path）
   - path
4. 更新数据

## createComponent创建VNode

> 创建VNode--> 构造子类 --> 挂载组件钩子 --> 实例VNode

## _update  --> __path\_\_ 把VNode转化真实DOMs

## mergeOptions

## 生命周期钩子

## 组件注册

## 异步组件

## 响应式语法糖

## 依赖收集和巧妙的watcher

## 派发更新（触发setter和watcher)

## nextTick

## 检测变化的注意事项

## 计算属性 VS 侦听属性

## 组件更新

## 原理图

# 编译

# Extends

## event

## v-model

## slot

## keep-alive

## transition

## transition-group

# vue-Router

# Vuex



