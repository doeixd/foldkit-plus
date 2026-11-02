// @vitest-environment node
/**
 * The build's check for declarations published as `any` (#340). The refused
 * lines are what tsdown wrote for `foldkit-remote` built before its
 * references' declarations existed; the kept ones are deliberate `any`s the
 * packages publish today.
 */
import { expect, test } from 'vitest'
import { anyDeclarations } from '../declared-any.mjs'

test.each([
  'export declare const Query: any;',
  'declare const Query$1: any;',
  '  const inner: any;',
  'export declare let state: any;',
  'export type Loose = any;',
  'type Shaped<A extends string> = any;',
  'export declare function make(input: string): any;',
  'declare function make<A>(input: A): any;',
])('refuses %s', line => {
  expect(anyDeclarations(`export {}\n${line}\n`)).toEqual([2])
})

test.each([
  'export declare const Query: QueryNamespace;',
  'export type AnyEntityBinding = EntityBinding<any, any, any>;',
  '  readonly execute: (input: any, context: ToolExecutionContext) => Promise<ToolResult>;',
  '  model: any;',
  'export declare const anyway: Anyway;',
  'export declare function make(input: any): Made;',
  ' * declare const x: any; written in a doc comment',
])('keeps %s', line => {
  expect(anyDeclarations(`${line}\n`)).toEqual([])
})
