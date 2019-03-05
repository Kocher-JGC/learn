# 安装

1. vuex的安装比较简单 --> 调用 applyMixin方法 -->
2. 区分版本 --> 2.x以上 -->  向Vue混入beforeCreate钩子 --> VuexInit
3. 而1.x的话 --> 修改Vue._init的方法向options.init之前加入vuexInit

# new Store

1. 在options中拿到plugins\strict
2. 存储内部状态 (定义一些内部使用的变量)
3. 在生成内部变量的时候有一个关键的地方new ModuleCollection(opts) --> 

### new ModuleCollection 建立_modules父子关系的modules

1. 传入的options当做根的Module 调用register函数进行注册 --> 
2. register --> 
   1. 对getters\actions\mutations进行断言 (检查)
   2. new Module --> 创建一个module --> ( 为新的module添加children\rawModule\state ) -->
   3. 首次进入 path.length === 0  ,设置当前实例化的module为rootModule -->
   4. rawModule.modules存在 枚举 modules中的元素,调用register进行新的modules的注册-->
3. 第二\三个register都是差不多的逻辑 --> 不同的是
   1. path.length不为0,会走else 逻辑 拿到parent 向其parent 添加children

### installModule 建立父子关系

> init根模块。这还递归地注册所有子模块并收集其中的所有模块getter。

1. 回到new Store的执行逻辑 
2. 一直往下走,继续定义变量和赋值 --> 直到调用installModule
   1. 获取是否根路由,获取namespace
   2. 第一次是根路由 --> 直接来到makeLocalContext --> 生成本地上下文--> makeLocalContext
      1. 定义local对象--> 对象含有dispatch和commit2个方法
      2. 为local 定义2个新的属性 getters\state
      3. 在属性的get的定义的时候会调用makeLocalGetters
         1. 生成本地的getters对getters进行代理访问,
      4. 返回定义好的local
3. 接着往下走

#### 枚举mutations调用registerMutation进行注册

1. namespace + key 组成 namespacedType       ( 命名空间的改变  )
2. 调用registerMutation --> 实际上是向store._mutations 添加 key 为组装好的namespacedType value为wrappedMutationHandler 的数组对象 -->
3. wrappedMutationHandler方法 将handler的调用指针指向store.并传入2个重要参数
   1. local.state
   2. payload
4. 接着往下走

#### 枚举actions调用registerAction进行注册

1. 组装type = action.root ? key : namespace + key;
2. 拿到真实的handler = action.handler || action;
3. registerAction 进行注册--> 
   1. 同样的向 store._actions 对应的type数组中添加一个handler (wrappedActionHandler)
   2. 但是此次有所不同的是
      1. 参数 ( {dispatch , commit , getters , state , rootGetters , rootState} , payload , cb ) **(重要的)**
      2. 运行体先运行 handler ,拿到res --> 强制转化为 promise --> 在返回promise (同时在返回之前对_devtoolHook工具进行了处理)
      3. **重点的不同出要理解情况,也是actions和mutations的区别**
4. 接着往下走

#### 枚举getters调用registerGetter进行注册

1. 同样的组装namespacedType

2. 调用registerGetter就比较简单

   1. 向store._wrappedGetters对应的type添加一个wrappedGetter函数--> 

   2. 该函数实际是调用传入的rawGetter(handler)函数 ,并传入4个参数

       ( local.state\local.getters\store.state\store.getters )

#### 三个重要的已经注册好了接下来就是注册子module --> 枚举module._children 调用installModule进行注册

**因为注册的逻辑都差不多就直接挑不同的说一下 :**

1. 此时isRoot为false&&hot也为false --> if条件满足
2. 先获取嵌套的状态 -->getNestedState --> 获取到了父级的store
3. 再拿到当前moduleName
4. 调用Vue.set --> 向父级的store 中加入moduleName对应的store ( 向是父级的store添加当前module的store )

### resetStoreVM (初始化负责响应式的存储vm)

**继续往下走,返回到new Store中**

1. 拿到oldVm\wrappedGetters\定义compited

2. 枚举wrappedGetters 向computed对象中对应的key添加一个函数,该函数是调用fn(store) 的结果 --> fn是wrappedGetters[key] 对应的函数

3. 对store.getters定义key对应的getter方法 --> 实际就是代理访问

4. 接着往下走 --> 

5. 拿到Vue.config.silent 储存一下--> 并强制设置为true

6. 实例化store._vm = new Vue() --> 传入date和上面组装的computed对象

7. 实例化完成后,将状态恢复

8. 额外的 --> 如果是严格模式状态就利用$watch开启严格模式

9. 已经如果oldVm存在的话,就将旧的$$state删除以及在nextTick(下一个任务栈执行的时候),销毁oldVm

   

**接着往下执行后面的是插件的安装以及浏览器的的devtools工具的初始化(初始化就这样完成了)**