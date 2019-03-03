1. 插件的注册
2. router的安装
3. 安装的时候干了什么
4. 组件和变量的注册和定义
5. vue对象的逻辑属性方法
6. vue对象的初始化逻辑
7. route-map
8. matcher



```html
<div id="app">
<h2>Hello Router!</h2>
<p>
  <router-link to="/route">Go to route</router-link>
  <router-link to="/bar">Go to Bar</router-link>
</p>
<router-view></router-view>
</div>
<script>
window.onload = function() {
  const Route1 = { template: '<div>Router Render</div>' };
  const Route2 = { 
    template: `
      <div>
        我是路由2渲染了<router-link to="/bar/foo">Go to foo</router-link>
        <router-view></router-view>
      </div>
    ` 
  };
  const Route3 = { template: '<div>我路由2的子路路由</div>' };

  const routes = [
    { path: '/route', component: Route1 },
    { 
      path: '/bar' ,  
      component: Route2 ,
      children: [
        {
          path: 'foo',
          component: Route3
        }
      ] 
    }
  ];

  const router = new VueRouter({ routes })

  console.log( new Vue({
    el: '#app',
    router
  }) )
}
</script>
```



# Install (Vue.use)

1. 我们知道向vue扩展插件的用的是Vue.use的全局api方法
2. use方法调用也是非常简单
   1. 先判断vue的插件库中是否有安装该方法,如果有安装则返回
   2. 如果没安装则判断插件的install方法存不存在,存在调用插件的install方法
   3. 否者传入的插件是一个函数,直接调用该函数进行注册,
   4. **同时需要注意的是无论使用哪种方法进行注册都会在args参数的前面加上当前Vue(this)实例作为参数传入**

## router是调用install方法安装VueRouter插件的

1. installinstalled = true // 标记状态   存储Vue

2. 定义2个工具函数 

   1. isDef 变量是否已经定义
   2. registerInstance --> 注册实例 ,, 实际上是调用_parentVnode.data上的registerRouteInstance方法

3. Vue.mixin()  --> 向Vue全局混入2个生命周期钩子

   1. beforeCreate 创建之前干了什么事情呢

      1. 在$options.router有定义的情况下 ,除了记录this._routerRoot和\_router变量外,调用了$options.router.init方法
      2. 没有定义的情况下直接 对_routerRoot进行赋值this或者父级的\_routerRoot
      3. 无论哪种情况都会调用registerInstance() , 传入了2次this与销毁不一样

   2. destroyed -->

      销毁的时候就直接调用上面定义的registerInstance方法进行销毁钩子

4. 调用Object.defineProperty --> 定义了$router 和$route 变量,而他们实际访问的是 this._routeRoot下面的值  ( 这就是平时路由访问的真面目  )

5. 调用Vue.component 向全局Vue注册2个组件[RouterView和RouterLink]  (这里先跳过)

6. 为boforeRouteEnter\beforeRouteLeave\beforeRouteUpdate使用相同的钩子created钩子

# VueRouter --> new VueRouter

1. 定义变量app\apps\options\beforHooks\resolveHooks\afterHooks\
2. matcher 是createMatcher的结果  --> 请看matcher的详解
3. 路由匹配mode的选择 -->
   1. 拿选项的或者是默认为hash
   2. 如果不支持h5的history --> 使用降级的hash方案
   3. 同时不在浏览器端就使用abstract ( 抽象的路由 )
4. 然后通过不同的mode进行不同的实例并且赋值给this.history

## matcher  --> createMatcher

1. 调用createMatcher的第一步会先调用createRouteMap --> 用于对传入的路径进行记录(注册) 
2. 并且拿到 3个用于记录路由的变量 { pathList \ pathMap \ nameMap }

### createRouteMap(对传入的路由进行处理-->添加到变量(添加路由记录))

1. 如果传入的后面三个变量为空那就,定义  --> **注意:这三个变量是用于记录路由的(如状态,和重复)**
2. 真正的方法实现是forEach传入的routes调用 addRouteRecord( 添加路由记录 )
3. 添加完成后,最后对"*"的处理,然后返回3个变量. ( pathList,pathMap, nameMap)

### addRouteRecord ( 添加路由记录,真正的对3个记录变量做修改,createRootMap的最主要的调用 )

> addRouteRecord的调用

#### 第一次循环传入的 是 ({ path: '/route', component: Route1 },)

1. 拿到path和name ,显然可以拿到path

2. 对path和compoent进行断言

3. pathToRegexpOptions 拿到 --> 并没有传入

4. 调用normalizePath --> 对path进行标准化处理

   1.  根据strict把最后的/去掉
   2. 根路径不处理
   3. 无父级不处理
   4. 父级path连上子path再把中的//转化为/返回结果 

5. 拿到标准化的路由后继续往下走 --> 判断caseSensitive是否为布尔值 --> 如果是赋值变量

6. 生成record变量

   ```js
   // 路由记录对象
   const record: RouteRecord = {
   path: normalizedPath, // 标准后的路径
   regex: compileRouteRegex(normalizedPath, pathToRegexpOptions), // 拿到路由匹配的正则表达式 ( 调用一个三方插件生成一个路由正则匹配的对象 ) 
   components: route.components || { default: route.component }, // 路由对应的comp
   instances: {}, //实例
   name, // 上面获取name
   parent, // 父级
   matchAs, //
   redirect: route.redirect, // 重定向
   beforeEnter: route.beforeEnter, // 传入的插入前钩子函数
   meta: route.meta || {},  // 传入的meta
   props: route.props == null //组件中的props
     ? {}
     : route.components
       ? route.props
       : { default: route.props }
   }
   ```

7. 判断route的alias是否存在 ( 实际是以该名字(path),创建一个记录,记录中的children和当前route相同 )

   > 所以alias没什么好讲的就是如此简单

   1. 存在对别名进行遍历
   2. 别名+route.children 组装一个别名的route 调用addRouteRecord 

8. 向pathMap和pathList添加数据

   ```js
   if (!pathMap[record.path]) {
       pathList.push(record.path); // 添加路径
       pathMap[record.path] = record; // 添加map --> 指向上面生成的Record(记录)
   }
   ```

9. 如果name存在这向nameMap中添加当前生成的Record

> 一遍流程走下来就能明白其实addRouteRecord就是向三个变量添加路由记录

#### 第二次循环 

1. 此次的解析与上一次不同的是有children --> 那就直接来到children的解析
2. route.children.forEach --> 
   1. 如果matchAs存在连上字符串 --> childMatchAs 
   2. **主要还是递归的调用addRouteRecord进行对记录的添加**

**小小的总结:从addRouteRecord可以看出来,记录的添加是先添加子的,后添加父的, 而同级的添加,先添加alias再添加本级的**

### 回到createMatcher --> 拿到生成的三个变量储存起来,往下执行

1. 可以发现下面执行的都是定义函数,最后就返回了 2个方法 ,match和addRoutes方法
2. 简述一下方法的作用 (源码中有详细的注释)
   1. addRoutes --> 实际上是调用createRouteMap往现有的路由记录中添加新的路由记录
   2. match -->  拿到或者创建 route
   3. redirect --> 生成重定向的路由 
   4. alias -->  别名路径的处理
   5. _createRoute --> 负责递归调用redirect或者alias -- >但最实际的是调用createRoute --> 进行生成真正的路由

### 回到new VueRouter

1. createMatcher创建好路由记录后,并拿到返回的2个方法赋值给matcher对象
2. 因为默认没传所有new 的是hash
   1. 简单说明hash和h5的history都是监听了一个popstate方法
   2. 该方法 history.[back\forward\go\replaceState\pushState] 都会触发
   3. 而且方法的触发都是调用this.transitionTo方法 

# init

> 在上的分析可以知道在Vue的beforeCreate钩子进行的init,我们就顺着这方向来到new Vue的beforeCreate钩子的调用

1. 由new Vue 可以知道,在new 的时候传入的是已经实例化的VueRouter
2. 所以在mergeOptions的时候会给到vm.$options上
3. 所以在调用beforeCreate钩子的时候 this.$options.router存在
4. 赋值_routerRoot和VueRouter实例到\_router上后
5. 接着就调用VueRouter实例的init方法
6. 所以这才是真正的路由初始化 (之前的是创建映射或者可以说是注册)

## VueRouter.init(vm)

1. 向apps中添加当前app (当前进行new Vue的vm)
2. 如果当前vm已经进行过初始化那就返回 ,通过this.app是否有记录来进行判断
3. 拿到new VueRouter的时候实例化的history对象 -->
4. 判断是属于哪一个实例调用不同的方法 --> 
   1. h5的history对象直接执行history.transitionTo
   2. hash组装一个setupHashListener方法再进行执行transitionTo --> 并在onComplete或者onAbort的时候延迟对popstate事件的监听
   3. 而无论使用哪种方法都会先调用  history.getCurrentLocation(), 把当前的原始路径拿到并传入执行
5. 最后调用history.listen对apps中每个app._route 的route进行修改

## transitionTo (最最最核心的调用)

1. 调用this.router.match 实际是调用 --> createMatcher的时候生成的match  --> 来到match方法的调用
2. location = normalizeLocation --> 解析传入路由的路由,生成path\hash\query的工具方法(跳过)
3. 如果location有name 这nameMap中拿Record进行解析否者
4. 直接对location.path进行解析
5. 对已经Record的pathList进行遍历如果matchRoute匹配 则调用 _createRoute进行路由创建
6. 可是一开始进来的是空'/'的所有没有匹配到结果 --> 调用 _createRoute(null, location)
7. 而 _createRoute 的实际调用是 util 下的 createRoute方法 --> 该方法返回的组装好的route对象

```js
const route: Route = {
    name: location.name || (record && record.name),
    meta: (record && record.meta) || {},
    path: location.path || '/',
    hash: location.hash || '',
    query,
    params: location.params || {},
    fullPath: getFullPath(location, stringifyQuery), // 生成route就已经生成fullPath
    matched: record ? formatMatch(record) : [] // 拿到一个数组 [父级,↓↓...,本级]
}
```

8. 回到transitionTo的执行 --> 传入生成的route 和 组装的onComplete\onAbort方法执行this.confirmTransition方法

> 往后执行是导航守卫相关的,所有抱歉的说本例子就到这了

 

 