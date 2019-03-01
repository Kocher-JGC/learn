# Directives

> 扩张章节很多都是跳过,直接来到关键的部分,详细的请看外面的基础

## v-model (绑定在el上)

```html
<div id="app">
<h3>v-model 绑定在DOM上</h3>
<el-model></el-model>
</div>

<script>
window.onload = function() {
  /** v-model 绑定在DOM上 **/
  let elModel = {
    template: `
    <div>
      <p>输入的内容: {{ message }} </p>
      <input v-model="message" placeholder="" >
    </div>
    `,
    data() {
      return {
        message: '信息'
      }
    },
  }

  let vm = new Vue({
    el: '#app',
    components: { elModel }
  })
}
</script>
```

genDirectivesk

baseOpts获取directives

4个model文件

1. compiler阶段
   1. parse --> 提取directive
   2. generate --> 生成code(语法塘事件)
2. path -->
   1. invokeCreateHooks -->
      1. updateDOMListener
      2. updateDOMProps
      3. updateDirective



### parse提取directive（parse阶段）

1. parse --> parseHTML(解析到input模板的时候) -->

2. parseStartTag --> 把model解析出来 --> handleStartTag  -->  把解析出来的属性标准化 --> (之前parse阶段解析过现在简单跳过) -->

3. 处理完之后调用option.start --> 生成AST节点，建立父子关系（DOM树）

   - 调用start的时候有个关键的函数

     ```js
     for (var i = 0; i < preTransforms.length; i++) {
       element = preTransforms[i](element, options) || element; //（preTransformNode） // /platforms/web/modules/model.js
     }
     ```

   - 解析el.attrsMap --> (因为是input,而且是v-model指令) --> 提取可能传入的(:type)进行解析 [ 解析分3种,checkbox+v-for , radio+v-for , 只有v-for的]

   - 所以主要是web平台下的v-model的特定格式转换 --> 获取bind中的type --> 存在type --> 对checkbox、radio、other[其他]进行处理 --> 解析for,添加属性,element,添加if判断体 ( 显然本次例子不满足不处理)'

   - 往下走 processElement --> processAttrs -->

   - 满足 dirRE.test(name) --> 无修饰符 -->  接着往下走 --> 走到else 解析普通指令 -->

     - name =  name.replace(dirRE, '')  --> 拿到'model '
     - 再用name.match(argRE) --> 在解析一遍名字(确保名字正确)
     - 调用addDirective 向el中添加新(相对应的)的directive --> 实际是添加一个 { name,rawName,value,modifiers,arg} 对象
     - 非生产环境检查model的命名(checkForAliasModel)

4. 跳过其他逻辑,结束parse阶段

### 生成运行时的code (generate)

1. new CodegenState(options) --> 拿到平台和vue本身的跨平台的directive --> 复制到state实例上

2. genElement --> 一直执行来到 --> input的genElement --> genData -->

3. genDirective -->

   1. 拿到刚才AST生成的directive --> 循环对dir进行处理

   2. 处理dir --> 在state实例拿到对应name获取相应的处理函数,如果存在对应name的处理函数则调用函数进行处理指令 --> 显然此处model是满足的

   3. 调用 /platforms/web/compiler/directives.js的model方法 -->

      1. 拿到dir中的,value,modifiers,tag,type

      2. 分情况调用不同函数进行对指令的处理 -->  tag == 'input' -->  调用genDefaultModel -->

         1. 尝试拿到attr上的type和bind的value,type

         2. 拿到修饰符（lazy、number、trim）并进行处理

         3. lazy不存在，且type ！= range --> event = input

         4. 组装表达式 默认为  '$event.target.value' ，在有trim的情况会加上trim() ,在有number的情况会变成  "_n(" + valueExpression + ")" 。

         5. 调用genAssignmentCode 对value进行进一步处理

            - parseModel --> 处理复杂的对象形式并返回{exp,key}

            - 显然此处无key，直接返回exp

            - > parseModel 是一个非常复杂的函数，可以自行传入复杂的对象进行单步调试

         6. 拿到返回的 exp和key  （key存在调用set手动进行观察者定义和调用主动更新）（不存在直接返回 (value + "=" + assignment) （解析的value = 解析出的valueExpression）

         7. code = genAssignmentCode （）

         8. genDefaultModel接着往下走，lazy不存在，且type ！= range 。 needCompositionGuard = true

         9. 所以 code = "if($event.target.composing)return;" + code; **（用于对中午输入的一个优化后面会提到）**

         10. addProp --> 主动向el中添加一个props属性 (所以就等于用了v-bing|：)

         11. addHandler --> 向el.events 添加一个input事件（相当于用了v-on|@）

         12. if (trim || number)  addHandler(el, 'blur', '$forceUpdate()'); // 如果需要去空格或者是转数字，手动强制刷新

         13. 通过10、11可以得到，v-model的解析就是自动向AST中添加了Prop和Handler。约等于手写v-bing+v-on

   4. 返回 model函数返回true --> 来到genDirectives --> neeRuntime = true -->

   5. hasRuntime = true 以及 向res中添加由{name、rawName、value、expression、arg、modifiers} 的JSON字符串

   6. hasRuntime = true 返回res （只有一个指令）

4. 拿到返回的dirs 向data添加dirs字符串拼接 --> 跳出genData --> 跳出genElement -->

5. 直接跳回generate 阶段 --> 生成的code如下

```js
_c('div',[
  _c('p',[_v("输入的内容: "+_s(message)+" ")]),
  _v(" "),
  _c('input',{
    directives:[
      {name:"model",rawName:"v-model",value:(message),expression:"message"}
    ],
    attrs:{"placeholder":""},
    domProps:{"value":(message)},
    on:{
      "input":function($event){
        if($event.target.composing)return;message=$event.target.value
      }
    }
  })
])
```

6. 显然经过编译后 多了3个属性,
   1. genDirectives中生成的json字符串
   2. domProps --> genDefaultModel 下调用addProp主动向el添加的props属性
   3. on:input --> genDefaultModel 下调用addHandler主动向el添加的event (因为该on绑定在el上所以就是向input添加了input事件)
7. generate阶段结束

### 渲染阶段 (update-->patch-->createElm --> 创建input元素的时候 -->

1. 创建完children之后对data进行处理调用 --> invokeCreateHooks -->  (循环调用cbs.create下的方法进行对data进行处理)

2. updateDOMListeners --> 拿到data.on中的on --> 调用normalizeEvents标准化事件 --> 调用updateListeners -->

   > 同样的和event绑定事件是一样的流程 (简单说说吧)

   1.  拿到事件名字,old没有定义,
   2. cur.fns 没有定义 createFnInvoker --> 包装函数
   3. 调用add --> 调用withMacroTask 再包装一次函数,返回add--> 向target(el).addEventListener添加input事件
   4. 新增不需要比较移除事件

3. updateDOMProps

   1. 拿到新旧的props

   2. props.__ob\_\_存在 需要extend一下,进行获取变量

   3. 枚举oldProps --> 如果新的props[key] 不存在的该key的值 就 elm[key] = '';

   4. 枚举props -->  获取到值 cur = props[key];

      1. key == ‘textConentent||innerHTML’ -->

         - 对children进行处理
         - if (cur === oldProps[key]) { continue }
         - if (elm.childNodes.length === 1)  elm.removeChild(elm.childNodes[0]; （issues的处理）

      2. key === 'value'  -->

         ```js
         elm._value = cur; // 赋值
         var strCur = isUndef(cur) ? '' : String(cur); // 处理值
         if (shouldUpdateValue(elm, strCur)) elm.value = strCur // 如果值可以使用直接复制给元素的value
         ```

      3. 直接赋值 elm[key] = cur

4. updateDirectives --> (/core/vdom/modules/directives.js) --> _update

   1. 判断 isCreate、isDestroy、标准化（oldDirs、newDirs）
   2. 枚举newDirs -->
      - old没定义 --> 调用bind钩子 ， inserted方法存在dirsWithInsert.push（ dir ）
      - 否则 --> 调用update钩子 ，componentUpdated方法存在dirsWithPostpatch.push（ dir ）
   3. 组装callInsert函数 --> isCreate == true --> mergeVNodeHook(vnode, 'insert', callInsert); ,向vnode中merge  insert钩子
   4. dirsWithPostpatch.length 向vnode中merge  postpatch构子 --> （钩子循环调用componentUpdated钩子）
   5. 如果!isCreate --> 枚举 oldDirs 调用unbind钩子，对指令进行取消绑定

5. 返回到invokeCreateHooks

6. insert钩子存在 -->  insertedVnodeQueue.push(vnode); （向vnodeQueue中push 当前vnode）

7. 返回最上级的createElm --> insert --> 插入DOM

8. 接着返回到patch阶段 --> 往下执行 调用invokeInsertHook(vnode, insertedVnodeQueue, isInitialPatch);

9. 因为上面在判断insert中，向insertedVnodeQueue添加了数据所以会枚举queue的长度进行调用insert钩子 （因为钩子被包装了几层所以直接调到insert钩子的执行）-->

10. directive.inserted -->

   1. tag 不是select -->不执行

   2. else if （tag = ’textarea‘ || isTextInputType ） 显然为true 走进if体

   3. 拿到bind的修饰符赋值给el._vModifiers

   4. 修饰符lazy不存在或者为false

      - 向元素添加3个事件

      - compositionstart （onCompositionStart）输入开始时触发

        ```js
        function onCompositionStart (e) {
          e.target.composing = true;
        }
        ```

      - compositionend （onCompositionEnd） 选择字/词完成输入时触发

        ```js
        function onCompositionEnd (e) {
          if (!e.target.composing) { return }
          e.target.composing = false;
          trigger(e.target, 'input');
        }
        ```

      - change（onCompositionEnd）

   5. 由上面可以得出为什么v-model可以在输入完成后才更新试图，而直接写@+：立马刷新视图的区别。

## v-model (绑定在component上)

```html
<div id="app"></div>

<script>
window.onload = function() {
  const child = {
    template: `
    <div>
      <input :value="msg" @input="updateValue" placeholder="" >
    </div>
    `,
    model: {
      prop: 'msg',
      event: 'change'
    },
    props:['msg'],
    methods: {
      updateValue(e) {
        this.$emit('change',e.target.value)
      }
    },

  }
  /** v-model 绑定在DOM上 **/
  let vm = new Vue({
    el: '#app',
    template: `
    <div>
      <h3>v-model 绑定在组件上</h3>
      <p>输入的内容: {{ message }} </p>
      <child v-model="message"></child>
    </div>
    `,
    components: {
      child
    },
    data() {
      return {
        message: '信息'
      }
    }
  })
}
</script>
```

### 父组件的compiler阶段

#### parse生成AST节点

- 由上一个例子的parse过程可以知道生成的ast节点
- attrsList\attrMap,都只有一个值那就是v-model解析出来的
- 同时directive上也有一个name为model的对象(addDirective解析出来的)

#### generate 直接来到解析child标签的时候进行genElement --> genData --> genDirective

1. 显然dirs只有一个(model)
2. 解析mdoel指令,同样的gen存在,调用gen--> 实际调用的是model函数 -->
   1. 拿值value\modifiers\tag\type
   2. el未被编译成组件,component不存在,来到最后的else if --> child 标签不是一个平台的保留标签--> 调用genComponentModel --> （实际向el.model上添加一个 { value，expression ， callback}的对象）
      1.  拿到修饰符 ref = modifiers 、拿到number、trim修饰符
      2. 如果trim修饰符存在 --> 对valueExpression 进行处理，如果baseValueExpression 为字符则去除空格，否则不处理
      3. 如果number修饰符存在 --> 就加上_n()方法 -- > 对baseValueExpression进行进行转化为number
      4. genAssignmentCode --> 同样的是对运行parseModel对运行表达式进行处理，返回函数体或者是用$set包裹的方法
   3. 回到if执行体返回 false
   4. needRuntime 为false --> （和上一个例子不同）不进行对应指令对象字符串的组装 --> 所以运行时的updateDirectives就不会执行该指令的创建的钩子；（那么该实例会延迟到什么时候呢，又有什么作用呢，带着疑问接着往下走。）
   5. 回到genData --> genDirectives 拿到的数据是空的 ， 往下执行
   6.  在genDirective中 el多了一个model对象 所以返回的data 会接上 data += "model:{value:" + (el.model.value) + ",callback:" + (el.model.callback) + ",expression:" + (el.model.expression) + "},";  （在返回的data中连上刚才el.model对应的的字符串对象）
3. 一直跳到generate返回code --> 可以看到生成的code

```js
with(this){
  return _c('div',[
    _c('h3',[_v("v-model 绑定在组件上")]),
    _v(" "),
    _c('p',[_v("输入的内容: "+_s(message)+" ")]),
    _v(" "),
    _c('child',{
      model:{ // 所以v-model生成就是这些内容
        value:(message),
        callback:function ($$v) {message=$$v},
        expression:"message"
      }
    })
  ],1)
}
```

> 一直往下走
>
> render --> vm._c （创建child组件） --> createElement --> createComponent -->

### createComponent（创建child组件）

1. 创建组件的构造函数（ctor）--> 同时在创建的时候进行了mergeOpts
2. data.model存在 (追朔来源：就是_c('child',{})上面传入的对象中就是传入的data，而且data有model对象) --> 调用transformModel(Ctor.options,data)
   1. 首先在这里你要认清楚options是属于child组件上的内容，而data是在父组件编译好传入的data
   2. 获取prop 、event --> opts.model存在拿存在的值否则有默认之为value、input
   3. 生成相应的props   data.props[prop] = data.model.value
   4. 拿到data.on 向on中添加相应的event --> on[event] = callback || [callback].concat(existing);
3. 回到create Component -->
4. 提取propsData --> 显然可以提取到{ msg: '信息' }
5. 同样的往下的逻辑也是大家熟悉的，拿到listeners、赋值nativeOn（交换事件）、安装组件钩子，返回组件的vnode

> render结束 --> 往下走 _update --> patch --> createElm -->

### child组件的createElm --> createComponent

1. 组件创建  组件的init钩子 --> createComponentInstanceForVnode --> new nove.componentOptions.Ctor() -->  vue._init() -->
2. initInternalComponent -->
   - 把先前生成的props、listener赋值给 propsData 、_parentListeners
3. initEvent --> (就是event组件处理的逻辑)
   - listeners存在调用updateComponentListeners(vm,listeners)
   - updateListeners -->
   -  cur = on[name] = createFnInvoker(cur); // 包装一下函数调用
   - add --> $on --> 修改vm._evnets[event] --> 添加新的fn （vm 是child的实例）（编译阶段可以知道，此次添加的是父组件传过来的编译过input事件，而且在transformModel赋值的名字的时候改变成了model.event (就是change)）【父子有点绕，要静心理解好】
   - （简单跳过，就是和event那样的一样，同时也是理解成为组件添加时间就是对vm._events数组进行操作）
4. initState --> 在mergeOpts已经说得很详细跳过

> 来到child.mount() --> child的编译阶段

### child的编译阶段 (那么多次parse的经验简单过**一遍)**

**parse --> ast节点 --> 显然会 @input 生成 { input: { value: 'updateValue' } } ，[{name:"value"，value:'msg'}] **

**generate生成code**

```js
with(this){
  return _c('div',[
    _c('input',{
      // 简单的在genData生成的data 就直接跳过流程了
      attrs:{"placeholder":""},
      domProps:{"value":msg},
      on:{"input":updateValue}
    })
  ])
}
```

> child组件的_update --> path --> createElm(input) -->
>
> ​    和上面v-model-el的例子一样在invokeCreateHooks的时候 -->
>
> ​    更新了input的value和其input事件 -->
>
> ​    -->  返回child的createElm --> 组件的createElm完成
>
> ​    --> 一直运行（并且一直跳过解析，因为后面的过程前面已经走了很多很多遍了，估计都很熟悉） --> 完成所有DOM的创建

### 在input中输入内容

1. 因为在inputDOM上绑定了input事件 --> 
2. 显然会触发methods中定义的updateValue --> （fn.withTash.fn --> invoker-->）

2. Vue.\$emit(change) -->  就会主动触发vm._events['change']所有事件 --> (invoker --> )    callback:function ($$v) {message=$$v} --> 
3. 正因为这一堆的语法糖改变了父组件的message --> 从而触发set --> 触发dep.notify() --> 
4. 然后后面得步骤大家也跟着跑了很多次了，所以就简单跳过了 -->
5. dep.notify --> watcher.update --> nextTick --> watcher.run() --> updateComponent --> 
6. 重新进行计算render以及updateChildren下面　diff进行更新DOM

> v-model 基本完了（大部分流程都详细得走了，就是有时候子父通信可能不好理解，或者太绕了，一定要静心看。）