import { inBrowser } from './env'

// 用于首字母拼接
export let mark
export let measure

if (process.env.NODE_ENV !== 'production') {
  // 用于性能检测
  const perf = inBrowser && window.performance // 代码埋点
  /* istanbul ignore if */
  if (
    perf &&
    perf.mark &&
    perf.measure &&
    perf.clearMarks &&
    perf.clearMeasures
  ) {
    mark = tag => perf.mark(tag)
    measure = (name, startTag, endTag) => {
      perf.measure(name, startTag, endTag)
      perf.clearMarks(startTag)
      perf.clearMarks(endTag)
      perf.clearMeasures(name)
    }
  }
}
