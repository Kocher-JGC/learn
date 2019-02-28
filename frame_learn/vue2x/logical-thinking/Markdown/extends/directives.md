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

         12.  if (trim || number)  addHandler(el, 'blur', '$forceUpdate()'); // 如果需要去空格或者是转数字，手动强制刷新

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