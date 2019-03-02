# slot

> 插槽的编译和运行都比较简单,跳过的步骤会比较多.

```html
<div id="app">
<app-slot>
  <h2 slot="header">{{ tit }}</h2>
  <p>{{ msg }}</p>
  <p slot="footer">{{ footer }}</p>
  <p>在后面的父组件默认的信息</p>
</app-slot>
</div>

<script>
window.onload = function() {
  let AppSlot = {
    template: `
    <div class="container">
      <header><slot name='header'><h2>子组件默认头部</h2></slot></header>
      <main><slot>我是默认的主体内容</slot></main>
      <footer><slot name="footer"></slot></footer>
    </div>`
  }

  let vm = new Vue({
    el: '#app',
    data() {
      return {
        tit: '父组件头部',
        msg: '父组件的主体内容',
        footer: '父组件底部'
      }
    },
    components: { AppSlot }
  })
}
</script>
```

## 父组件的compiler阶段

### parse阶段(attrs有slot的)

1. 直接来到h2的options.start --> processElement --> processSlot --> 
2. getBindingAttr(el,'slot') --> 可以获取到header字符串并移除attrsList中对应项 ---> 
3. 向el.slotTarget添加获取到的slotTarget --> 并且el不是template和作用域插槽(向el.attrs添加name为slot,value为'header'的对象)
4. 返回genElement--> 执行完整h2的parse -->
5. 发现只有el只在processSlot的时候进行了2个改变,多了一个slotTarget属性以及在attrs上添加了一个对象{name:'slot',value:'header'}

> 由此可推断出整个父组件parse阶段所生成的AST节点,后面的解析都跳过

### CodeGenerate阶段

> gen阶段也没有什么特别的直接简单简述带过,抽象的在脑子生成code

来到h2的genElement --> genData -->

1. 在processSlot的时候向attrs添加了{name:slot,value:'header'}对象 --> 解析成attrs的对象字符串并加入data字符串中
2. 往下走,el.slotTarget 有值,向data拼接 slot: el.slotTarget 字符串 --> 其他的gen跳过

加上其他的codeGenerate得到如下的code

```js
with(this){
    return _c('div',{attrs:{"id":"app"}},[
        _c('app-slot',[
            _c('h2',{attrs:{"slot":"header"},slot:"header"},[_v(_s(tit))]),
            _v(" "),
            _c('p',[_v(_s(msg))]),
            _v(" "),
            _c('p',{attrs:{"slot":"footer"},slot:"footer"},[_v(_s(footer))]),
            _v(" "),
            _c('p',[_v("在后面的父组件默认的信息")])
        ])
    ],1)
}
```

## 跳过render和生成组件的构造器--> 组件的init钩子的执行 --> 子组件的初始化过程

> 很重要,后面拿到slot的依据

1. 在 初始化的 mergeOptions中 调用了initInternalComponent函数 -->   opts._renderChildren = vnodeComponentOptions.children (向options,添加相应的渲染children)

   > 追索一下children的来源：
   >
   > children是在_parentVnode的componentOptions上
   >
   > 而该内容又是从生成vnode的时候来的 --> 追索到 createComponent
   >
   > 不难发现,在创建组件vnode的时候把children传入new VNode生成的
   >
   > (也就是_c /createElement的时候传入generate的时候生成的children)

2. 接着往下走来到了initRender --> vm.$slots = resolveSlots(options._renderChildren, renderContext);

3. 调用resolveSlots解析插槽(父组件传入的children)

4. children一共有7个 3个为空白文本节点,两个有name的2个没有name的

5. 根据循环的逻辑最后生成的slots 对象中含有的数据如下

   1. key为default 有5个数据 3个空白字符的vnode,2个p标签的vnode
   2. key为footer的有一个标签为p的vnode
   3. key为header的有一个标签为h2的vnode

6. 就这样能够把父组中子组件标签内生成的vnode全部赋值到子组件实例的 $slot对象中

**结束子组件的init阶段接着往下走** 

### 子组件的的parse阶段

1. 同样的道理直接来到slot标签的解析 --> processSlot() --> el.tag 为slot --> 将其解析出来 --> el.slotName = getAndRemoveAttr(el,'name');  
2. (解析slot标签 为el添加slotName 属性 --> 从name中获取或者是undefined)

### 子组件的CodeGenerate --> 直接跳到genSlot

1. 拿到parse阶段生成的slotName 或者如果没有的就是default 
2. genChildren 对slot中的子内容进行解析
3. 组装res --> _t(slotname,children,attrs) [渲染插槽的函数] --> 对应的是renderHelpers/renderSlot方法
4. slot就是如此简单的code阶段 --> 直接展示生成的结果

```js
with(this){
    return _c('div',{staticClass:"container"},[
        _c('header',[
            _t("header",[_c('h2',[_v("子组件默认头部")])])
        ],2),
        _v(" "),
        _c('main',[_t("default",[_v("我是默认的主体内容")])],2),
        _v(" "),
        _c('footer',[_t("footer")],2)
    ])
}
```

## 子父组件都编译好了,下面来进行渲染阶段

1. _t --> 调用的是renderSlot
2. 不难发现刚才在initRender解析插槽的时候全部都往$slots中添加数据所有renderSlot都是走else逻辑
3. 在else逻辑里 nodes = this.$slots[name] || fallback; ( 显然这就是 vue 在插槽有对应内容渲染对应内容,没有渲染插槽默认内容的秘密所在)
4. 同时往下走如果传入的data(props)中含有插槽,会调用createElement 创建一个template包裹的vnode 否则直接返回vnode

### render阶段完成

> 通过_t的处理后拿到的vnode要么是父组件传进来的要么就是子组件插槽默认的而且还是已经进行数据映射后的所以slot的流程(谜底已经解开)走完了,后面就是createElm --> 都是普通的DOM的创建就不接着往下走了,直接跳过了,主要是理解slot编译、传值、渲染流程

**同时这样也出现了一个问题，父组件的数据可以带到子组件进行渲染那么，子组件的数据如何传递给父组件呢？？或者说父组件如何访问子组件的数据呢？？那么就是插槽的另一种形式作用域插槽**

# scopeSlot

```html
<div id="app">
  <app-slot>
    <p slot="default" slot-scope="defaultData">{{ defaultData }}</p>
    <template  slot="other" slot-scope="otherData">
        {{ otherData }}
    </template>
  </app-slot>
</div>

<script>
  window.onload = function() {
    let AppSlot = {
      template: `
      <div class="container">
        <slot text="Hello" :msg="msg"></slot>
        <p><slot name="other" :otherMsg="ohterMsg"></slot></p>
      </div>`,
      data() {
        return {
          msg: '子组件的默认信息',
          ohterMsg: '子组件的其他信息'
        }
      },
    }

    let vm = new Vue({
      el: '#app',
      components: { AppSlot }
    })
  }
</script>
```

## 父组件的compiler阶段

### parse阶段 (依然直奔主要部分)

1. processElement(p) --> processSlot --> 来到else if ,能在el中获取到slot-scope --> 

   1. 获取到slotScope 赋值到el的slotScope中
   2. 接着往下走同样的获取el 的slot 属性 赋值给el.slotTarget 并向el中的attrs添加{name:slot,value:slotTarget}  (和普通插槽一样)
   3. 回到 options.start 的执行体 --> 因为processSlot的时候向el添加了slotScope  --> 所以if(element.slotScope) 成立  --> 向其父级的scopedSlots 添加本次解析的element

   ```js
   if() {}
   else if (element.slotScope) { // scoped slot
     currentParent.plain = false;
     var name = element.slotTarget || '"default"'
     ;(currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element;
   }
   ```

2. processElement(template) --> processSlot --> if(el.tag === 'template') --> 

   1. 获取scope 属性 --> 进行兼容处理2.5低版本的处理
   2. 正常情况下也是在el中获取 slot-scope  
   3. 同样的往下走获取slot属性 ,并添加el.slotTarget 以及添加attrs

**最后解析完在tag为app-slot的ast节点上会有scopedSlots属性里面有2个对象分别对应  1. default 对应p的ast 2. other对应template的ast**

### generate阶段

1. 因为app-slot的el上有genScopedSlots在genData的时候调用genScopedSlots --> 返回 scopedSlots: _u() 的一个对象字符串 --> 调用genScopedSlot -->

   1. 根据tag为template或者if进行 生成fn 并和key一起生成一个{key:key,fn:fn}的对象
   2. 生成fn的过程也是递归调用genChildren或者genElement过程,都是那些套路就跳过了

2. 作用域插槽的generate阶段和普通插槽的generate有所不同,编译的结果如下:

```js
with(this){
  return _c('div',{attrs:{"id":"app"}},[
    _c('app-slot',{
      scopedSlots:_u([
        {key:"default",fn:function(defaultData){
          return _c('p',{},[_v(_s(defaultData))])
        }},
        {key:"other",fn:function(otherData){
            return [_v("\n          "+_s(otherData)+"\n      ")]
        }}
      ])
    })
  ],1)};
```

## 在父组件执行render的时候执行_u方法实际调用resolveScopedSlots

1. 对传入形式为{key:key,fn,fn}的数组对象进行解析 --> 解析成 key : fn 形式的对象
2. 所有本次例子中解析出来的对象为 

{

​	default: fn,

​	other: fn

}

### 划重点: _c('app-slot',{})

1. 在resolve后生成了一个key为scopedSlots的数组对象 走进了createElement 方法 而 app-slot是组件实际是调用fcreateComponent 生成vnode的 -->
2. 而此时传入的第二个参数不是数组,即不是children,既然不是children在createElement的时候就会被解析成data,父组件传给子组件的Data
3. 最后该Data会留在app-slot的vnode的data上 --> 在创建组件app-slot的时候调用render方法会进行获取父占位符节点的数据  vm.$scopedSlots = _parentVnode.data.scopedSlots || emptyObject;
4. 这样父组件解析出来的渲染函数,通过vnode.data.scopedSlots的传值方式传入给子组件的vm.$scopedSlots中
5. **所以父组件解析出来的渲染函数,直接成为子组件的一个变量中的属性/方法,让子组件调用**

## 子组件的compiler

### parse阶段

1. 在子组件中parse阶段解析slot标签和普通的slot解析没什么差别就是为el添加了一个slotName属性
2. 然后解析attrs的时候就把对应的静态attr和动态v-bing的attr解析出来放入ast节点的attrs中

**因为解析slot和普通的差别不大所有就简单描述一下(子组件的parse比较简单)**

### generate阶段

1. 直接来到genSlot(2个slot解析都一样,就这样,子组件的数据就传入到_t的执行中) --> 
   1. 同样的获取slotNamt , 以及genChildren获取其children , 但是不同的是此时al的attrs有数据所有生成的字符串代码中会多了一个attr属性 _t(slotName,children,attrs)

```js
with(this){
  return _c('div',{staticClass:"container"},[
    _t("default",null,{text:"Hello",msg:msg}),
    _v(" "),
    _c('p',[
      _t("other",null,{otherMsg:ohterMsg})
    ],2)
  ],2)
}
```



## 子组件render

1. _t调用的 renderSlot --> 由code可以得到 renderSlot的三个参数
   1. 插槽的名字 --> name
   2. fallback --> 插槽的默认内容--> 当前例子为null
   3. props --> 子组件slot标签解析的数据
2. **在上面提到子组件render调用的时候,在_parentVnode.data获取到了父组件编译好的渲染函数在scopedSlots变量中,而且该变量的值给到了vm.$scopedSlots **
   1. 由此流程可以拿到父组件编译好的对应的渲染函数
   2. 而name 为default 的渲染函数存在,  scopedSlotFn(props) 并把子组件的数据(props)传入执行 --> (**由此一来就能达到父组件拿到子组件数据的效果**)
   3. 同时生成好对应的vnode
3. 同理后面生成name为 other的插槽过程也是一样的 (生成vnode过程一样)

**由此可以知道生成vnode的时候就把父组件传过来的函数结合当前组件的属性/变量进行生成vnode.达到子组件的数据在父组件渲染的目的**

> 同样后面的createElm的阶段和以前的一样就跳过了

# 小总结

普通slot --> 把解析出来的children传入给子组件,让子组件渲染slot的时候,渲染父组件的内容.

作用域slot --> 把解析出来的插槽,放入scopeSlot变量,通过_parentVnode.data传入到子组件的实例中,并且在子组件编译的过程把,属性和变量结合编译出来,在运行renderSlot方法的时候,既能够在vm.$scopeSlots变量中拿到父组件渲染的code,又能够拿到子组件子身的变量和属性,传入对应的函数运行.来达到子组件的数据给父组件用的目的.