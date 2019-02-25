/* @flow */

/** 一个处理队列的函数（好处）
 * 1. 直接next执行下一个队列，可控制函数执行顺序
 * 2. 控制函数执行时间，如异步/同步
 * 3. 可以动态对队列进行修改，从而在执行的时候添加新的函数
 **/
export function runQueue (queue: Array<?NavigationGuard>, fn: Function, cb: Function) {
  const step = index => {
    if (index >= queue.length) {
      cb()
    } else {
      if (queue[index]) {
        fn(queue[index], () => {
          step(index + 1)
        })
      } else {
        step(index + 1)
      }
    }
  }
  step(0)
}
