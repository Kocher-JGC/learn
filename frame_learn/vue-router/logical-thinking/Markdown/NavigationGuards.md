# 导航守卫

**在走流程的时候先认清楚几点以及属性整个导航解析的流程**

1. confirmTransition 下的队列的生成和执行 (导航守卫的执行核心)
2. 深刻理解runQueue的运行流程从而达到深刻理解\导航守卫的流程
3.  理解清楚流程就要理解清楚导航守卫的触发时机和加载过程
4. 简单流程导航离开 --> 解析路由||调用路由配置 --> DOM更新 --> 更新后的回调

> 因为在base已经分析过路由的解析\注册\形成map\建立父子关系等逻辑,则导航守卫主要就讲述transitionTo进行导航切换运行导航守卫的逻辑

> (习惯性叫钩子请读者见谅)

## 完整的导航解析流程 (来源官网)

1. 导航被触发。
2. 在失活的组件里调用离开守卫。`  beforeRouteLeave`
3. 调用全局的 `beforeEach` 守卫。
4. 在重用的组件里调用 `beforeRouteUpdate` 守卫 (2.2+)。
5. 在路由配置里调用 `beforeEnter`。
6. 解析异步路由组件。
7. 在被激活的组件里调用 `beforeRouteEnter`。
8. 调用全局的 `beforeResolve` 守卫 (2.5+)。
9. 导航被确认。
10. 调用全局的 `afterEach` 钩子。
11. 触发 DOM 更新。
12. 用创建好的实例调用 `beforeRouteEnter` 守卫中传给 `next` 的回调函数。

## 首次进入页面( '/' ,根目录)

1. 小插曲:在进入页面渲染的时候会先注册3个全局的router钩子 ( beforeEach\beforeResolve\afterEach )
2. 由base例子可以知道,页面初始化的时候,因为传入了router,存在会执行init方法,这时候会进行**第一次触发 history.transitionTo**

### 第一次transitionTo

1. 可以很清楚知道当前路由是/,没有任何的对应的路由的component.解析出来的route只有path

2. 往下执行 调用 this.confirmTransition 传入解析的route,成功的回调和失败的回调 -->　进入该函数

3. 获取当前route和解析出来的route --> 对比路由,显然根路由的对比结果为false --> 往下走执行队列的逻辑

4. resolveQueue --> 拿到不同的队列,(update/deactivated/activated) --> 看下面解析

   > 比如说 / bar 和 /foo 两个路径的matched相比完全不同 , 需要先执行bar的销毁(取消激活) ,再执行foo的创建(激活)
   >
   > 或者说如 /bar/a 和/bar 或者 /bar/b 两个路径的matched有共同之处,除了要销毁和激活,还要执行更新的操作

5. 往下执行组装调用的队列 -->

   1. 移开|离开的钩子   extractLeaveGuards(deactivated) --> 实际调用 extractGuards 拿到 beforeRouteLeave 钩子对应流程第二点 **(注意:(子的情况[离开];父的情况[更新]))**
   2. 从全局router中拿到.beforeHooks --> 可以知道页面初始化的时候,向router注册了一个,所有可以拿到一个函数
   3. 同理  extractUpdateHooks --->  解析的是组件中的beforeRouteUpdate钩子,在更新时候会存在,就是上面resolveQueue解析的第二种可能存在 --> 第一次拿到空数组
   4. map解析resolveQueue解析出来的activated钩子 --> 拿到beforeEnter函数,生成数组
   5. resolveAsyncComponents --> 用于解析异步组件的一个函数 

6. 队列生成完--> 记录pending状态\组装iterator函数  --> 

   - iterator函数用于路由执行的处理 --> 
   - route被更改的处理
   - 运行hook出错的处理
   - 运行时候出错/异常的处理
   - 调用下一步

7. 准备工作做好了 --> 调用runQueue --> 执行队列并且传入回调函数 -->

   1. 第一次队列的执行，显然会执行到　全局定义的beforeEach钩子
   2. 第二次队列的执行，　执行的是异步组件的函数，不是异步组件直接跳过了

8. 走出队列，执行callback --> 

   1. 取出beforeRouteEnter钩子 和 全局的beforeResolve钩子进行合并形成新的队列继续并执行 -->

9. 来到了新的队列 --> 可以知道在全局的时候传入了beforeResolve钩子,所以队列中会有一个函数执行 -->

   - 执行beforeResolve钩子

10. 执行第二个队列的回调 --> 

    1. 判断route有没被改变 --> 改变执行失败/取消(abort)的方法
    2. 将pending = null
    3. **这里要注意:** 执行**onComplete**(onComplete是执行confirmTransition传入的第二个参数) --> 
       - 执行updateRoute --> 1. 更新current = route /2.history有listen执行cb调用listen /3. 之前router的afterEach钩子
    4. 执行ensureURL --> 对hash路由的处理
    5. 改变ready状态调用readyCbs (调用ready回调)
    6. 执行完onComplete回到第二个队列的回调的执行
    7. **向app执行的nextTick中加入刚才解析beforeRouteEnter钩子中的next函数的执行体,在页面渲染完成后的下一次任务表中执行**

11. **至此整个初始化过程完成,并且对_route对象进行响应式代理(访问)**

12. 直接往下执行patch渲染DOM 渲染DOM的时候会有一个组件进行实例化也会触发到beforeCreate钩子,但是因为router已经实例化了,所有只是对_routerRoot的添加和调用registerRouteInstance函数

    - 该函数主要是对实例的赋值
    - 赋值后的实例,在beforeRouteUpdate钩子等地方用到

## 点击Go to foo

> 默认情况下会触发RouterLink组件的 方法 --> 默认实际触发的是  router.push(location);

1.  router.push(location)方法的触发 --> 因为我们默认使用的是hash的history处理规则
2. 获取ref = this\ 以及 current \   调用 transitionTo -->

### 第二次transitionTo

1. 依旧获取route ,此时 route中matched有一个匹配,(因为new VueRouter的时候定义了)
2. 调用confirmTransition --> 依旧那样的逻辑就大部分都跳了 --> 

### 不同的:

1. 显然此次matched是有匹配的,而原本的没有 --> 可以的得知 --> activated数组有一个元素来自 /foo

2. 但是最后解析队列的结果和第一次是一样的也只有2个有效结果

3. 来到第一次队列执行的cb --> 因为foo传入了beforeRouteEnter钩子所有可以解析出来 --> 该钩子在beforeResolve钩子执行前 --> 

4. 执行beforeRouteEnter钩子 **(此时执行的函数是在fn中包装的所以输出的this为Windows或者undefined) -**-> 调用next --> 来到组装的guard函数的cb --> **执行next传入上一个next执行传入的cb** --> 

5. 用户传入的cb脱离了运行流,接着按照原来的队列接着执行(非常巧妙的封装)

6. next 执行到下一个钩子 --> beforeResolve --> 队列执行完成--> 调用第二次队列的回调 --> 

7. 这次来到transitionTo的onComplete的执行有所不一样是 hash中的push传入的

   ```js
   pushHash(route.fullPath); //添加路由记录 (支持history使用history否者hash)
   handleScroll(this$1.router, route, fromRoute, false); //滚动处理
   onComplete && onComplete(route); // 用户传入的完成回调
   ```
8. 回到第二次队列执行的回调 --> 向nextTick添加任务 

   1. 同时该任务就是我们传入的beforeRouteEnter的next --> 
   2. 所以next传入的回调是渲染视图完成的nextTick执行的

9. **注意一点就是:**  (在init的时候传入了对history监听的回调,这是运行完调用cb导致视图真正更新的原因) (有点绕,但是又巧妙又灵活)

   ```js
   history.listen(route => {
     this.apps.forEach((app) => {
       app._route = route // 数据改变触发视图的更新
     })
   })
   ```

## 点击 Go to Bar2 (直接跳来不同处)

1. bar属于foo的子路由 --> 所以updated上有/foo的matched ..activated上的是/foo/bar/:id的matched
2. 这样一来第一次的queue比前面2次的多了一个执行bar的beforeEnter的钩子,在队列的第三位
3. 执行队列 --> 2 次队列的执行和后面回调的使用都和点击Go to foo类似直接跳过

## 点击Go to Bar1(直接跳来不同的)(注意bar1是replace不是push)

1. replace和push的onComplete回调中,只是pushHash 改为 replaceHash 
2. 此次因为 bar1和bar2 属于同级的动态路由 --> 所以updated 有2个  matched ( /foo . /foo/bar/:id )
3. 解析出来的队列第三位也有所不同 ,是一个用于执行多个守卫的函数 --> (**更新操作因为之前已经对component实例已经创建了,在实例创建的beforeCreate钩子中调用registerInstance(this, this) 函数已经对实例进行赋值 --> 所以能获取到vm实例并且传入和改变this指针** )
4. 调用完 beforeRouteUpdate钩子之后,后面的运行逻辑也没什么差别就跳过了

## 当再次点击Go to Bar1的时候

> 因为前后的路由是相同的所有会走到sameRoute的逻辑 this.ensureURL();    return abort() --> 就是换了个hash的操作\然后就取消了

## 但是点击Go to Bar2却不一样

1. 路由是push的不是replace --> 对于url 会变成/foo/bar/1/bar/2
2. 在resolveQueue的时候 会deactivated数组会生成2个matched,而updated和activated却没有
3. 最终导致没有匹配到任何结果,现在最开始的页面 --> 该页面就是首次刷新进来的页面

# 额外的一些注意

1. 无论使用hash还是history --> 都会向window监听popstate|| (hashchange/hash用来兼容的) 事件 --> 该事件 history.[back\forward\go\replaceState\pushState] 都会触发 --> 而触发的function最终还是触发this.transitionTo --> 进行守卫/滚动/路由记录等操作
   - 本质调用的还是transitionTo,也是就是守卫分析的内容所以就跳过了
2. 导航守卫的运行比较绕,但是跑几次,debugger几次,那就很好的摸头的,不要太在意工具函数的实现,想要理解工具函数的实现,直接抽出来,用自己的例子更好理解
3. 注意queue的运行,那是核心,而且也是难点容易晕的地方