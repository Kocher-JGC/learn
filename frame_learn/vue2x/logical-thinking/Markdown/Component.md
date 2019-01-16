# Vue.component 注册全局组件

1. validateComponentName(id) --> 开发环境下验证component的名字
2. 定义组件name = options.name|| id
3. 调用Vue.extend方法继承Vue 来注册组件。

## extend方法注册组件（注册时候传入的是一个Obj）

1. 纪录父级和父级id （Super 、SuperId）
2. 定义_Ctor 用来缓存已注册的组件。 有就返回简单点
3. 验证组件可用性。定义sub构造函数、原型继承、改变指针、记录cid、合并父级配置、定义父级
4. 初始化props、computed
5. 继承Vue的静态方法（extend、mixin、use、component、filter、directive、一些options
6. 缓存当前构造函数
7. 返回sub

## 全局异步组件的注册

1. 传入的是一个函数不是一个Object所以Vue.options.components [id] = 传入的Func

# Component（从new Vue 开始）

## 跳过初始化流程

1. 跳过mergeOptions
2. 跳过init （lifecycle、events、render、injections、state、provide）
3. $mount --> 跳过编译（compileToFunctions） --> mountComponent() -->
4. 定义 updateComponent --> new Watcher() -->  watcher.get() 

##   watcher.get() 

1. pushTarget(this) --> 把当前watcher push进targetStack数组 --> 改变静态变量（Dep.target = _target）

2. watcher.getter() --> _update(\_render())

3. _render ->  render.call() --> （因为initProxy的时候render = hasHandler）

   ```js
    (function anonymous(
   ) { with(this){
        return _c('div',[_v("\n I am parent!!\n "),_c('child'),_v(" "),_c('app'),_v(" "),_c('async-comp')],1)
    }})
   ```

### create流程(每个函数执行都会执行hasHandler.has())

1. _v("\n I am parent!!\n ") --> createTextVNode() --> **创建一个文本VNode**
2. _c( vm , 'child',undefined,undefined,false)--> _createElement() --> createComponent(Ctor[实例时候的Opts]，data，vm，children[undefined],tag:['child']) -->
   - 拿到baseCtor (Vue) -->  因为Ctor是一个obj -->  Ctor = baseCtor.extend(Ctor); （调用Vue.extend创建一个component实例的构造函数）
   - resolveConstructorOptions（）--> 解析构造函数选项的依赖关系 --> 赋值listeners、on、slot、--> installComponentHooks() --> 安装组件钩子['init','prepatch','insert'.'destroy']
   - new Vnode() --> 生成**组件vnode**并返回vnode --> 一直返回至 _c
3. _v(" ")  --> createTextVNode() --> **创建一个文本VNode**
4. \_c('app') -->_createElement()--> createComponent(Ctor[先前生成的组件的构造函数]，data，vm，children[undefined],tag:['app']) 
   - (因为本身就是一个构造函数所以不需要extend的逻辑) --> 此构造函数在一开始 Vue.component（'app'）时候就生成了	
   - 其他步骤基本同上跳过
5. \_c('async-comp') -->_createElement()--> createComponent(Ctor[传入的func]，data，vm，children[undefined],tag:['async-comp']) 
   - 来到了isUndef(ctor.id)的逻辑  --> resolveAsyncComponent(手动传入的fn，Vue ， vm)
     - 组装一些数据【contexts、forceRender、resolve、reject】函数
     - res = factory(resolve,reject) 调用传入的函数、并传入组装的对象
     - factory无loadling和resolved返回undefined
   - **创建一个异步的占位符节点并且返回vnode** --> 一直返回到最上级 _c

### _c 中的children的vnode生成完毕开始最后的\_c的调用 

1. --> _createElement(vm,tag:['div'],data:[undefined],children:[之前生产的vnode数组],normalizationType:[1]) -->  ** 
2. 最后一个参数为1调用normalizeChildren --> 递归铺平children为一级数组
3. 该tag为div是浏览器自带的标签 --> 创建了一个**标签vnode**
4. 然后又一直返回 到最上级调用 --> _update

### _update（赋值跳过直接来到） --> path 方法 --> path(vm.$el:[#app],vnode:[上面最后生成的vnode])

1. 解析参数、拿到oldElm、parentElm --> 调用createElm（vnode:[传入的vnode]，inserteVnodeQueue:[]，parentElm:[body]，nextElm:[textDOM]）

### createElm

1. 第一个是一个普通的div-->直接跳到createChildren（vnode，children：【之前生成的而且铺平的vnode数组】，insertedVnodeQueue：[]）
2. checkDuplicateKeys --> 检查和复制key
3. 循环children调用createElm --> 
   1. 第一个是text直接调用createTextNode创建text节点 --> 并插入到父级中（前面创建的div）
   2. 第二个是child的组件
      - 来到createComponent --> 检查是否已经init的组件而且是有keepAlive
      - 调用组件init钩子 --> createComponentInstanceForVnode() --> 组装参数 --> 调用new vnode.componentOptions.Ctor(options) （组件构造函数、也是走_init方法） -->initInternalComponent()
        1. 拿到实例下的构造器下的options 调用create并赋值到vm.$options
        2. 赋值parent、_parentVnode、propsData、\_parentListeners:[child的组件vnode] 、\_renderChildren 、 \_compentTag:['child']
        3. 同样的初始化操作 --> 一直往上跳调到 组件的init方法继续走
      - child = vnode.componentInstance = createComponentInstanceForVnode的返回值
      - child.$mount （主动mount挂载）挂载{\<div>\<p>child component\</p>\</div>}
      - 挂载渲染和之前的类似 - -> 最大的差别在于无parent不会insert直接返回渲染的静态DOM 赋值给vm.$el
      - **还原activeInstance**（在这里你不能忽略他）
      - 设置 vm.$el.__vue\_\_ = vm
      - *函数调用完生成好了DOM一直往上返回来到组件init*
      - initComponent --> 
        1. vnode.elm = vnode.componentInstance.$el(赋值DOM)
        2. isPatchable-->递归查找顶级实例是否存在 --> 存在 -->invokeCreateHooks()
           - invokeCreateHooks --> 循环调用收集的cbs.create的函数【update[attrs/class/DOMListener/DOMProps/Style/Direvtives]、_enter/create】
           - 拿到组件的钩子函数  create存在调用
           - insert存在 调用 往里面insertedVnodeQueue  push 当前vnode
        3. 设置css作用域
      - 调用insert方法向父级div插入DOM（一开始生成的最大的DIV）
   3. 后面的app组件和文本雷同
   4. **值得注意的是（insertedVnodeQueue）这个变量一直会贯穿整个path过程用于收集插入的组件vnode**
   5. 来到最后一个vnode 异步组件(来源：createComponent -->  resolveAsyncComponent && createAsyncPlaceholder --> 拿到的一个注释占位vnode)
      - 所以这个createElm创建和插入了一个注释节点
4. **如果data存在调用 invokeCreateHooks 就执行一遍cbs.create如果该vnode是一个组件vnode就把该vnode push 进 insertedVnodeQueue **
5. insert插入上面生成的DOM树
6. 跳出createElm -->移除旧的DOM --> 循环遍历调用组件insert钩子 --> 跳出patch --> 来到_update
7. 赋值最后渲染的DOM、和__vue\_\_ 等一系列赋值
8. 整个new Vue 结束 挂载了第一次的DOM

### 一秒后来到setTimeout逻辑（ _c('async-comp') ------> res = factory(resolve,reject) 逻辑被调用的地方）  （异步组件的一些解析）

1. 从setTimeout出发 -->  调用了回调的第一个参数的方法（resolve）、而且传入了一个{template} --> once内部调用 --> ensureCtor (comp , Vue) --> 
   - comp是一个对象调用Vue.extend(comp) 生成组件 --> 返回一个普通组件的构造函数 
2. 拿到构造函数赋值给 factory.resolved 
3. 因为该异步组件已经被解析过了所以 sync为false --> 调用 forceRender(true)
4. 循环context（new Vue的实例）--> 调用 $forceUpdate（） 执行强制更新
5. --> vm._watcher.update() --> queueWatcher(this:[watcher]) --> 
6. 把当前watcher（以为异步的父级）push到queue（队列中）--> 并把flushSchedulerQueue函数放在下一个microTimerFunc任务执行（nextTick-->异步执行任务）
7. flushSchedulerQueue --> (先简单分析一下)
   - （queue）对队列中的watcher进行排序 （保证父组件在前子组件在后）
   - 循环queue。 调用watcher.before() --> (对于组件而言就是调用new Watcher时候传入的 beforeUdate钩子)
   - --> 调用watcher.run() -->  this.get() --> 
   - pushTarget(this) --> value = this.getter.call(vm, vm); --> _render() --> _update（）
   - 重新 创建vnode 和之前的类同的逻辑
   - 注意不同的是这时候 async-comp 已经在Vue中注册（已经是一个可以实例DOM的构造函数）
   - _render编译所有VNode后调用\_update进行真实的DOM渲染，此次就能把异步组件渲染出来_
8. **update() --> patch() --> patchVnode() 进行更新（在后面的更新过程中补充）**









# 总结

1. 编译后的

