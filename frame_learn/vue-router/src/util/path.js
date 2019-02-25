/* @flow */
// 返回拼接好的路径
export function resolvePath ( // 解决路径
  relative: string,
  base: string,
  append?: boolean
): string {
  // 拿到第0位的字符
  const firstChar = relative.charAt(0)
  if (firstChar === '/') {
    return relative // 如果是路径则不处理
  }

  // 是hash或者query 那就连接起来
  if (firstChar === '?' || firstChar === '#') {
    return base + relative
  }

  // 由父到子的栈
  const stack = base.split('/')

  // remove trailing segment if:
  // - not appending // 不追加
  // - appending to trailing slash (last segment is empty)
  // 不将appending附加到尾随斜杠（最后一段为空）
  if (!append || !stack[stack.length - 1]) { // 不追加或者split结果一位都没有
    stack.pop()
  }

  // resolve relative path // 解析相对路径
  const segments = relative.replace(/^\//, '').split('/')
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (segment === '..') { // 退一层
      stack.pop()
      // . 表示本层 上面排除了上一层,所以这里是本层
    } else if (segment !== '.') { // 在本层将结果结果推入栈
      stack.push(segment)
    }
  }

  // ensure leading slash // 确保以/开头斜线 因为下面用/链接数组
  if (stack[0] !== '') {
    stack.unshift('')
  }

  return stack.join('/')
}

// 截取path 返回处理好的{path,query,hash}
export function parsePath (path: string): {
  path: string;
  query: string;
  hash: string;
} {
  let hash = ''
  let query = ''

  // 截取hash部分
  const hashIndex = path.indexOf('#')
  if (hashIndex >= 0) {
    hash = path.slice(hashIndex)
    path = path.slice(0, hashIndex)
  }

  // 截取query部分
  const queryIndex = path.indexOf('?')
  if (queryIndex >= 0) {
    query = path.slice(queryIndex + 1)
    path = path.slice(0, queryIndex)
  }

  return {
    path,
    query,
    hash
  }
}

/** 把双/转化为单/ **/
export function cleanPath (path: string): string {
  return path.replace(/\/\//g, '/')
}
