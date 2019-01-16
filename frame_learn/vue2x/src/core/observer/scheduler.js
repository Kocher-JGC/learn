/* @flow */

import type Watcher from './watcher'
import config from '../config'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import {
  warn,
  nextTick,
  devtools
} from '../util/index'

export const MAX_UPDATE_COUNT = 100

const queue: Array<Watcher> = []
const activatedChildren: Array<Component> = []
let has: { [key: number]: ?true } = {}
let circular: { [key: number]: number } = {}
let waiting = false
let flushing = false
let index = 0

/**
 * Reset the scheduler's state. 重置程序状态
 */
function resetSchedulerState () {
  index = queue.length = activatedChildren.length = 0
  has = {}
  if (process.env.NODE_ENV !== 'production') {
    circular = {}
  }
  waiting = flushing = false
}

/**
 * Flush both queues and run the watchers.
 * 刷新两个队列并运行观察程序。
 */
function flushSchedulerQueue () {
  flushing = true // 我的理解是正在更新
  let watcher, id

  // Sort queue before flush. 刷新前对队列进行排序。
  // This ensures that: 这样可以确保
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child)
  // 组件从父级更新到子级。（因为父级总是在子级之前创建）
  // 2. A component's user watchers are run before its render watcher (because
  //    user watchers are created before the render watcher)
  // 组件的用户观察程序在其呈现观察程序之前运行（因为用户观察程序在呈现观察程序之前创建）
  // 3. If a component is destroyed during a parent component's watcher run,
  //    its watchers can be skipped.
  // 如果在父组件的监视程序运行期间销毁了某个组件，则可以跳过其监视程序。
  queue.sort((a, b) => a.id - b.id) // 队列拍下序

  // do not cache length because more watchers might be pushed
  // as we run existing watchers
  // 不要缓存长度，因为在运行现有的观察程序时可能会推送更多的观察程序
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index]
    if (watcher.before) {
      watcher.before() // 更新前的回调（如：执行beforUpdate钩子）
    }
    id = watcher.id
    has[id] = null
    watcher.run() // run一下更新(计算)值
    // in dev build, check and stop circular updates.
    // 在dev build中，检查并停止循环更新。(一个无限更新的bug)
    if (process.env.NODE_ENV !== 'production' && has[id] != null) {
      circular[id] = (circular[id] || 0) + 1
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          'You may have an infinite update loop ' + (
            watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`
          ),
          watcher.vm
        )
        break
      }
    }
  }

  // keep copies of post queues before resetting state
  // 重置状态前保留发布队列的副本
  const activatedQueue = activatedChildren.slice()
  const updatedQueue = queue.slice()

  resetSchedulerState()

  // call component updated and activated hooks
  // 调用组件更新并激活挂钩
  callActivatedHooks(activatedQueue) // keep-alive 使用的
  callUpdatedHooks(updatedQueue)

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush') // 针对调试工具的
  }
}

function callUpdatedHooks (queue) {
  let i = queue.length
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    // 如果当前_watcher是自身的weather而且已经挂载了 ==>调用updated钩子
    if (vm._watcher === watcher && vm._isMounted) {
      callHook(vm, 'updated')
    }
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 * 对在修补过程中激活的保持活动状态的组件进行排队。在修补整个树之后，将处理队列。
 */
export function queueActivatedComponent (vm: Component) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  // 在此处将“_inactive”设置为“假”，以便渲染函数可以
  // 依赖于检查它是否在非活动树中（例如，路由器视图）
  vm._inactive = false
  activatedChildren.push(vm)
}

// 激活子组件记录状态
function callActivatedHooks (queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 * 将观察程序推入观察程序队列。具有重复ID的作业将被跳过，除非在刷新队列时将其推入。
 */
export function queueWatcher (watcher: Watcher) {
  const id = watcher.id
  if (has[id] == null) {
    has[id] = true
    if (!flushing) {
      queue.push(watcher)
    } else {
      // if already flushing, splice the watcher based on its id
      // 如果已经刷新，则根据其ID拼接观察程序
      // if already past its id, it will be run next immediately.
      // 如果已经超过了它的ID，它将立即运行。
      let i = queue.length - 1
      while (i > index && queue[i].id > watcher.id) {
        i--
      }
      queue.splice(i + 1, 0, watcher)
    }
    // queue the flush
    if (!waiting) {
      waiting = true
      nextTick(flushSchedulerQueue)
    }
  }
}
