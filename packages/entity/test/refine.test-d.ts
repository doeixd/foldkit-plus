/**
 * Refinements, a write's `from` and `becomes`, and `Laws.check`'s entries, at
 * the type level. Each negative case holds one defect, so its directive can
 * only be unused if the check it tests is gone.
 */
import { Schema } from 'effect'
import { expectTypeOf } from 'vitest'
import {
  Entity,
  Expr,
  Footprint,
  Laws,
  Query,
  Write,
  type ConditionedWrite,
  type Query as QueryOf,
} from '../src/index.js'

const Box = Entity.define(
  'Box',
  Schema.Struct({
    id: Schema.String,
    status: Schema.Literals(['open', 'shut']),
    weight: Schema.Number,
  }),
)
const Crate = Entity.define(
  'Crate',
  Schema.Struct({ id: Schema.String, status: Schema.Literals(['open', 'shut']) }),
)

const Open = Entity.refine(Box, 'Open', { status: 'open' })
const Heavy = Entity.refine(Box, 'Heavy', ({ row }) => Expr.gt(row.weight, 10))
const CrateOpen = Entity.refine(Crate, 'Open', { status: 'open' })

// The literal form's `is` narrows the fields it names; the predicate form's narrows nothing.
declare const row: { readonly status: 'open' | 'shut'; readonly weight: number }
if (Open.is(row)) expectTypeOf(row.status).toEqualTypeOf<'open'>()
if (Heavy.is(row)) expectTypeOf(row.status).toEqualTypeOf<'open' | 'shut'>()

// `build` is given the row, and nothing of the past.
// @ts-expect-error
Entity.refine(Box, 'Was', ({ before }) => Expr.eq(before.status, 'open'))

// A literal key that is no field.
// @ts-expect-error
Entity.refine(Box, 'Coloured', { status: 'open', colour: 'red' })

// A value the field cannot hold.
// @ts-expect-error
Entity.refine(Box, 'Gone', { status: 'gone' })

expectTypeOf(Query.from(Open)).toEqualTypeOf<QueryOf<typeof Box>>()

const Shut = Entity.input(Box, Schema.Struct({ id: Schema.String, status: Schema.Literal('shut') }))

// A `from` is a conditioned write, which may be refused as unmet; a write with neither is not.
const conditioned: ConditionedWrite<typeof Box, typeof Shut.schema.fields, 'Update'> = Write.update(
  Shut,
  { id: 'id', from: Open },
)
// @ts-expect-error
const unconditioned: ConditionedWrite<typeof Box, typeof Shut.schema.fields, 'Update'> =
  Write.update(Shut, { id: 'id' })
void conditioned
void unconditioned

// A state of another Entity is no `from`, and no `becomes`.
// @ts-expect-error
Write.update(Shut, { id: 'id', from: CrateOpen })
// @ts-expect-error
Write.update(Shut, { id: 'id', becomes: CrateOpen })

// A declared footprint is of the entry's Entity.
Laws.check({
  writes: [
    {
      name: 'Weigh',
      entity: Box,
      footprint: Footprint.declared({ writes: [Box.fields.weight], by: 'the scale' }),
    },
    { name: 'Import', entity: Box, footprint: Footprint.unknown },
  ],
})
Laws.check({
  writes: [
    {
      name: 'Weigh',
      entity: Box,
      // @ts-expect-error
      footprint: Footprint.declared({ writes: [Crate.fields.status], by: 'the scale' }),
    },
  ],
})
