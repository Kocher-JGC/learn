# 因为只对核心的知识进行描述、记录、分享所以只用HTML简单复现并分析源码

1. vm._data
2. proxy 代理数据 get和set  this[key] 代理访问 vm._data[key] （ES6 proxy）
3. 合并配置 （代码有变化）
4. 生命周期（在源码哪里能够干嘛，钩子的执行和逻辑）







1. 渲染：普通的只有数据的渲染、render 函数的、component、

2. render渲染，第3个参数默认全部当做字符串输出（当做文本节点处理）

3. update也用render看

4. 插入先子后父递归。

5. 最原始的vue组件研究（

   - createComponent
   - Vue.extend
   - patch过程

   ）

6. Vue.component 组件注册的研究

7. 异步组件（重点）





watcher 和 Dep 和 scheduler 等 观察者模式实现的响应式数据（语法糖的定义）