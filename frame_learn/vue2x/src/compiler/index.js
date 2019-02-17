/* @flow */

import { parse } from './parser/index'
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
// ` createCompilerCreator`允许创建使用替代分析器/优化器/代码生成的编译器，例如SSR优化编译器。
// 这里我们只导出使用默认部分的默认编译器。
/* 
 * 由此得知baseCompile函数负责调用默认编译器和返回编译的结果
 * 1、调用parse函数返回ast节点 （并且调用optimize对ast节点进行优化）
 * 2、调用generate 创建render函数和staticRenderFns函数
 * 思考既然说是默认的编译，那么其他编译有哪些
 * **/
// 在create-compiler中调用createCompilerCreator返回的是createCompiler函数
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  // 生成ast节点
  const ast = parse(template.trim(), options)
  if (options.optimize !== false) {
    optimize(ast, options) // 对ast 节点进行优化
  }
  const code = generate(ast, options) // 创建render函数和staticRenderFns函数
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
