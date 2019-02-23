# event

## 编译

### 编译父组件的结果

```js
(function anonymous(
) {
  with(this){
    return _c('div',[
      _c('child',{
        on:{"select":selectHandler},
        nativeOn:{
          "click":function($event){
            $event.preventDefault();return clickHandler($event)
          }
        }
      })],1)}
})
```

###  parse

1. parseHTML 解析 --> events的结果 attrsMap: { @click.native.prevent: "clickHandler",@select: "selectHandler" }
2. 在解析Child标签的时候 --> processElement --> processAttrs -->
3. 第一个循环(name =  @select )来到 else if (onRE.test(name)) 逻辑 -->
4. 调用addHandler -->
   1. modifiers 修饰符不存在 , 事件类型不为click --> 
   2. events = el.events = {}  --> ( 为el添加events对象,并获得其内存指针储存在变量中方便后续操作 )
   3. 定义newHandler = { value: value.trim() }
   4.  定义 handlers变量  拿到 events[name] --> ( 因为是添加事件,而且同名事件可能是多个所以要先拿到再处理) -->
   5. 分情况处理 
      1. 情况1 是否为数组
      2. 情况2 是否已经存在
      3. 情况3 向前添加事件还是向后添加事件(important)
   6. plain = false
5.  第二个循环( @click.native.prevent ) -->
6. parseModifiers(name) --> 可以得到 2个值 --> modifiers: { native: true,  prevent: true}
7. 调用addHandler (第二次) -->
   1. 此次进来modifiers有2个值
   2. 事件类型为click --> 对鼠标事件进行处理( right -> 改为contextmenu , middle -> 改为mouseup ) --> 但不存在这两个修饰符所以name不用修改
   3. capture(使用事件捕获模式) / once(一次事件) / passive(提升触屏事件触发事件) --> 不存在该三个修饰符不用修改  name  --> 
   4. 往下走 modifiers.native 存在 --> 删除nativeshux  并且  events = el.nativeEvents (所以后续对event的操作实际是对el.nativeEvents操作) -->
   5. 同样的 定义newHandler = { value: value.trim() } -->
   6. modifiers 存在 --> newHandler 添加新属性--> newHandler.modifiers = modifiers
   7. 和上述一样分情况处理,修改plain的值

**最后在child标签的ast上有2个表事件的属性 : { events: select: {value: "selectHandler"} , click: modifiers: {prevent: true} , value: "clickHandler" } } ** 

这就是eventsAST生成的大致流程. 不是很全但只要熟悉就可以很好的理解源码并运用到项目中,最好也可以用在实际架构开发中.

### optimize

该组件仅有一个div和child  一共2个标签,很显然div无插值表达式和指令 属于静态节点,但是child是一个组件并且有event绑定故为静态节点和静态根,所以div不为静态根

### code(generate)

1. 来到genChildren (解析child组件)  --> genElement --> genData -->
2. if ( el.events )  data += (genHandlers(el.events, false)) + ","; --> 解析 select: {value: "selectHandler"} --> genHandlers -->  
   1. genHandlers --> 很显然当前解析的事件类型为events 使用 on:{ 开头 ,同时进入for循环来调用genHandler来对事件进行进一步处理 --> genHandler ( 只有一个select就直接来了 ) --> 
   2. 如果传入的handler为数组那么就 组装数组,循环调用genHandler进行解析
   3. modifiers 不存在    且   simplePathRE.test(handler.value); == true --> 直接return handler.value -->
   4. 结果 on:{"select":selectHandler}
3. if (el.nativeEvents) data += (genHandlers(el.nativeEvents, true)) + ","; --> 解析 click事件 --> genHandlers -->
   1. 此时传入的isNative == true --> 使用 nativeOn: { 开头 , 循环解析events --> 
   2. 同样的解析isMethodPath = simplePathRE.test(handler.value); = true ,但此时modifiers有值走else逻辑 --> 
   3. 定义变量 ,for in 枚举modifiers对modifiers进行解析 -->  解析modifiers分3种情况
      1. modifierCode 中有对应key的值 --> 连接modifierCode中对应的字符串 ,向keys中push  key
      2. key === 'exact' --> 对4个特殊键的处理, 主要用于组合按键使用的事件的处理
      3.  else 逻辑 直接想keys中 push  key
   4. 显然prevent 是存在的 连接modifierCode字符串 --> 枚举结束 -->
   5. 根据上面isMethodPath = true 组装函数体字符串并返回结果 -->  ("function($event){" + code + handlerCode + "}") -->
   6. 最后得到 --> "nativeOn:{"click":function($event){$event.preventDefault();return clickHandler($event)}}"
4. generate结束

### 编译Child组件

```js
(function anonymous(
) { 
  with(this){
    return _c('button',{
      on:{
        "click":function($event){clickHandler($event)}}
    },[_v("click me>")])}
})
```

### parse

1. 有了上面的理解,理解child组件的编译就简单很多了 
2. parseHTML 生成--> attrsMap: {@click: "clickHandler($event)"}
3. addHandler --> 
   1. 同样name == click 但不满足 modifiers.right 和 modifiers.middle
   2. 也不满足三个特殊的修饰符(capture,once,passive)
   3. 需要注意的是 该事件为 event是而不是 nativeEvents 这个需要注意 --> 虽然事件为原生事件但是没有native修饰符 --> 在后续运行时候也注意一下理解 --> (区别) -->最后
   4. 生成 --> events: {click: {value: "clickHandler($event)"}}

值得注意的就是此次的click直接和上面父组件的native上的click事件对比,其运行和绑定

### optimize

同样的很容易得出 Object.keys(node).every(isStaticKey)  --> events 不为静态key --> 元素的 static = false 和 staticRoot = false

### code(generate)

1. generate --> genElement --> 最后的else逻辑 --> genData --> 
2. 同样的el.events存在 调用 genHandlers( el.events , false ) 进行字符串的拼接 --> 
   1. isNative = false, 使用 on:{ 拼接 
   2. genHandler处理click -->  
   3. handler.value = Object.keys(node).every(isStaticKey) ,不满足  simplePathRE,和 fnExpRE 的正则 而且modifiers不存在 -->
   4. ("function($event){" + (handler.value) + "}") --> (在外面包装一层返回结果) 
   5. **这就是为什么我们可以获取事件处理event的原因**
3. 最后得到的结果  --> on:{"click":function($event){clickHandler($event)}}

generate结束 --> 注意查看addHandler ,那就理解为什么,可以访问原生event事件的原因

## 运行

> 同样的还是挑重点和逻辑来讲.
>
> 开头忽略\跳过部分:
>
> ​	$mount --> mountComonent --> Watcher --> watcher.get() --> updateComponent( --> _createElement() [VNodeCreate] (以及createComponent进行生成组件构造函数)--> _render() \ _ update) --> patch --> createElm --> createChildren --> 渲染子组件 --> 组件是child --> child的createElm

### 根据上述的忽略逻辑,来到了child的createElm 

**特别说明:** 在child组件的createComponent的时候有一段需要注意的代码

```js
// 拿到了on事件,再把原生事件赋值给on 
// 而本来的on的事件作为参数传入Vnode的实例
// 使VNode的componentOptions 多了listeners的选项是原始的on
// 而nativeOn 则 --> on
const listeners = data.on
data.on = data.nativeOn
... 
const vnode = new VNode(
  `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`,
  data, undefined, undefined, undefined, context,
  { Ctor, propsData, listeners, tag, children },
  asyncFactory
)
```

1. 因为child是组件所以走进了createComponent里面
   1. i.data存在而且i.data.hook.init也存在 --> 调用组件init的钩子函数 --> 

   2. 在钩子函数里因为是第一次调用所以else逻辑调用createComponentInstanceForVnode --> createComponent --> 调用组件的构造函数 --> 组件构造函数执行vue._init -->
      - 组件进行mergeOpts --> 

        ```js
        // 有这2句代码 这样从父节点方法就可以通过此应用的关系映射到子节点的$options._parentListeners中
        // 同时正因为这个引用形成了子父通信.
        var vnodeComponentOptions = parentVnode.componentOptions;
        opts._parentListeners = vnodeComponentOptions.listeners;
        ```

      - initLifecycle --> 获取\$options.parent 然后把当前 vm push 进 \$parent.\$children中 --> 形成了父子依赖关系

      - 根据上述mergeOptions可得 存在_parentListeners --> initEvents 中调用updateComponentListeners() -->  updateListeners(listeners, oldListeners || {}, add, remove, createOnceHandler, vm);

        1. 由上面传入的参数可得 用同一套逻辑对事件进行增删改,同时增删改也是自己定义的

        2. 枚举传入的事件(on) --> 

           1. normalizeEvent 对 事件进行处理（3个特殊的事件passive、once、capture）

           2. 拿到新的绑定的on （cur） 和旧的绑定的 old（old）

           3. cur不存在报错、old不存在添加新的、都存在判断是否相等，不相等更新

           4. 显然old不存在 

              ```js
              if (isUndef(cur.fns)) {
                // 组装invoker函数并把真实调用的函数赋值到invoker.fns中
                cur = on[name] = createFnInvoker(cur);
              }
              if (isTrue(event.once)) {
                // 如果normalizeEvent 解析出来是有once 那就调用 createOnceHandler再封装一层
                cur = on[name] = createOnceHandler(event.name, cur, event.capture);
              }
              // 真正添加方法
              add(event.name, cur, event.capture, event.passive, event.params);
              ```

           5. 调用add、显然是调用vm.$on() --> 

           6. vm指向child , $on的实际操作是对vm._event数组的添加(同理\$off是对vm.event的删除)

        3. 枚举完成 为vm._event添加了select数组里面有一个方法

        4. 枚举old --> 移除不存在或者删除的对应的方法 ($off方法看源码有注释流程就跳过了)

      - 返回init 跳回component.init钩子的实现 --> 执行$mount方法

   3. $mount方法 开始一直跳到 createElm(创建buttonElm) --> 创建完children接着往下走 --> 调用invokeCreateHooks -->循环cbs的create --> 因为listener存在所以进入updateDOMEListeners --> 

      1. 拿到vnode.data.on --> (拿到click事件) --> 调用updateListeners --> (所以添加/删除事件的逻辑和组件添加/删除事件的逻辑是一样的,只是add不同) --> 既然一样就跳过了 --> 
      2. add 添加原生DOM事件 -->  先调用withMacroTask 包装函数(和createFnInvoker) 类似 --> addEventListener 添加原生DOM事件 -->

   4. 跳回 invokeCreateHooks  -->  跳回createElm --> 跳回patch -->  一直返回 child组件mount完成 --> 一直返回 --> createComponent

   5. createComponent --> 执行完init钩子往下执行 --> 

      1. 在component.init钩子的时候已经对vnode.componentInstance赋值 所以走进 initComponent函数 --> initComponent(vnode, insertedVnodeQueue);
      2. 在initComponent中拿到vnode.elm (拿到原生的DOM) --> 
      3. if(isPatchable(vnode) == true ) 执行 --> 循环查找vnode.componentInstance._vnode --> 找到最低级的组件的实例的\_vnode(就是找到最低级的vnode不是组件为止/也可以理解为找到第一个不是组件的vnode) [可能有点表述不清楚,多看几遍或许你能懂] --> 故找到button的VNode ,显然返回true (同理如果找到的是文本节点那就返回false) --> 往下执行 --> 
      4. 执行和createElm后面一样的逻辑 执行  invokeCreateHooks(调用cbs创建的钩子) 和 setScope设置css作用域 
      5. 执行invokeCreateHooks -第3个 -->  updateDOMListeners --> updateListeners() --> 添加组件传入的click事件 --> 后面又是一样的跳过 --> 完成整个生成的过程

**稍微梳理一下:**

1. 首先初始化component的时候先绑定组件事件(就是修改vm._event)
2. 然后createChildren[button]绑定 button 的click事件 --> 所以执行 Button childed!!  并执行emit --> 执行 组件绑定的事件 --> 输出 Child select!
3. 然后在组件上绑定的click 是最后绑定的所以 后执行 输出 --> Child clicked!

