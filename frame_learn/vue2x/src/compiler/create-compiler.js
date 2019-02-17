/* @flow */

import { extend } from 'shared/util'
import { detectErrors } from './error-detector'
import { createCompileToFunctionFn } from './to-function'

// 调用createCompilerCreator返回createCompiler函数
export function createCompilerCreator (baseCompile: Function): Function {
  // createCompiler函数 // 返回Compile函数和compileToFunctions函数
  /** 组装compile函数
   * 接收不同平台的baseOptions（函数柯里化）
   * 调用外部传入的baseCompile（重点1）
   */
  return function createCompiler (baseOptions: CompilerOptions) {
    function compile (
      template: string,
      options?: CompilerOptions
    ): CompiledResult { // 编译执行的函数
      // 先复制创建平台相关的options
      const finalOptions = Object.create(baseOptions)
      const errors = []
      const tips = []
      // 拿到平台相关的tips或者error
      finalOptions.warn = (msg, tip) => {
        (tip ? tips : errors).push(msg)
      }

      if (options) {// 对选项的处理
        // merge custom modules // 合并自定义模板
        if (options.modules) {
          finalOptions.modules =
            (baseOptions.modules || []).concat(options.modules)
        }
        // merge custom directives // 合并自定义指令选项
        if (options.directives) {
          finalOptions.directives = extend(
            Object.create(baseOptions.directives || null),
            options.directives
          )
        }
        // copy other options // 复制其他选项
        for (const key in options) {
          if (key !== 'modules' && key !== 'directives') {
            finalOptions[key] = options[key]
          }
        }
      }

      const compiled = baseCompile(template, finalOptions)// 调用传入的baseCompile函数真正编译（生成ast、render、staticRenderFns）
      if (process.env.NODE_ENV !== 'production') {
        errors.push.apply(errors, detectErrors(compiled.ast)) // 检查正则表达式的错误
      }
      // 赋值先前的在选项中存下来的error和tips
      compiled.errors = errors
      compiled.tips = tips
      return compiled //结果：(ast、render、staticRenderFns、errors、tips)
    }

    // 返回Compile函数和compileToFunctions函数
    return {
      compile,
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}
