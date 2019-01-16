# 生命周期钩子

> 先来一波官网的生命周期钩子图

![官网的钩子图](../../../../assets/img/lifecycle.png)

## 第一阶段

> 此阶段的代码在init.js --> _init函数中
>
> 这个阶段主要是给vue的实例赋予属性、合并配置、初始化数据中心

1. 每个vue实例都会先初始化事件中心和生命周期和记录这些的数据（initEvent、initLifecycle、initRender）
2. 调用beforeCreated钩子
3. 初始化有关数据的（initInjections、initState、initProvide）
4. 调用created钩子

## 第二阶段（$mount) 挂载阶段

> 当el传入或者调用vm.$mount()方法时候会触发该阶段
>
> 此阶段发生的完，第一次渲染已经完成了
>
> 此阶段的代码在lifecycle.js --> mountComponent函数中

1. 编译template、生成render -->
2. 调用beforeMount 钩子
3. 组装updateComponent函数（更新dom调用的函数、watcher调用的get方法）--> 实例化watcher -->传入编辑的updateComponents函数和 beforeUpdate钩子（在getAndInvoke（cb）调用中当cb传入调用）
4. 调用_render() --> _update() -->  path -->  createElm --> 渲染真实的Dom
5. 调用mounted钩子
6. 标志着实例已经挂载/已经渲染 --> 返回vm实例

## 第三阶段（数据更新）

> 当数据变化触发的时候
>
> beforeUpdate的调用函数定义在lifecycle.js --> mountComponent函数中 new Watcher 中传入 before回调
>
> updated的调用定义在scheduler.js -->  flushSchedulerQueue --> callUpdatedHooks --> 循环队列（queue）--> 调用

1. 数据发生改变触发之前订阅的语法糖 --> 来到了watcher.run -->  调用beforeUpdate钩子
2. 进行数值数据的计算和更新。
3. resetSchedulerState 重置
4. callActivatedHooks --> 组件更新的钩子
5. 当数据更新完成后调用callUpdatedHooks（）把所有的updated的钩子执行

## 第四阶段（销毁）

> 有一个状态记录，就是用来防止正在销毁还有重复销毁的现状。因为组件的更新导致的。所以开关控制最好。
>
> 此阶段的代码在lifecycle.js --> lifecycleMixin中向Vue混入$destroy(Vue.prototype.\$destroy) -->
>
> 在此函数中有定义了销毁开始和结束的钩子的定义。 

1. 调用beforeDestroy钩子 标记销毁状态为正在销毁
2. 移除Dom 从其父级将其移除
3. 取消数据变化订阅、标记vm状态为已经销毁掉
4. path 重新挂载/渲染/移除 DOM
5. 调用destroyed钩子（已经销毁完成）
6. 最后再把当前vm的事件全部注销了。(注意事件是最后消除的)
7. 设置值 vm.\$el.__vue\_\_ = null \ vm.$vnode.parent = null