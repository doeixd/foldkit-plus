/**
 * The translation (`src/lower.ts`) has one function per node kind, typed by
 * every tag of `expr.ts`'s scalars and predicates: a node kind added there
 * changes the tags below, and `lower.ts` does not compile until its table
 * translates it.
 */
import { expectTypeOf } from 'vitest'
import type { EntityNode, LowerTable } from '../src/lower.js'

expectTypeOf<keyof LowerTable>().toEqualTypeOf<EntityNode['_tag']>()

expectTypeOf<EntityNode['_tag']>().toEqualTypeOf<
  | 'Literal'
  | 'Field'
  | 'Input'
  | 'Next'
  | 'Call'
  | 'Viewer'
  | 'Now'
  | 'Path'
  | 'ViewerPath'
  | 'Eq'
  | 'Null'
  | 'Contains'
  | 'In'
  | 'And'
  | 'Or'
  | 'Not'
  | 'Compare'
  | 'Test'
  | 'Exists'
>()

declare const table: LowerTable
const { Exists: _exists, ...withoutExists } = table
// A table missing one kind is no translation.
expectTypeOf(withoutExists).not.toExtend<LowerTable>()
expectTypeOf(table).toExtend<LowerTable>()
