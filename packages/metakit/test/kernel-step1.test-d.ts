/**
 * The types step 1 adds: tables typed by the operation ids, supplied values
 * and `Option` paths that infer without annotation, the null-giving
 * operations, and `PathAccessor` named from the main entry.
 */
import { Option, Schema } from 'effect'
import {
  Eq,
  Expr,
  Node,
  Null,
  Path,
  Str,
  Transition,
  opProperties,
  type OpProperties,
  type PathAccessor,
} from '@doeixd/metakit'
import { call } from '@doeixd/metakit/build'

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const holds = <T extends true>(): T => true as T

// A table typed by the ids: a missing entry and a wrong id do not compile.
// @ts-expect-error every operation needs a row
const partial: { readonly [Id in Node.CoreOpId]: OpProperties } = { 'bool.and': {} }
void partial
// @ts-expect-error no operation has this id
void opProperties['num.pow']
// @ts-expect-error an operator's id is one of the closed set
type Stray = Node.Op<'num.pow'>
declare const stray: Stray
void stray

// A property names an operation by its id.
// @ts-expect-error the inverse of an operation is an operation
const wrongInverse: OpProperties = { invertible: { inverse: 'num.minus' } }
void wrongInverse

// Supplied values infer from their Schemas, and a step must be given them.
const Stamped = Schema.Struct({ at: Schema.Int, by: Schema.String })
const Stamp = Transition.make({
  state: Stamped,
  input: Schema.Struct({}),
  supplied: { now: Schema.Int, who: Schema.String },
  apply: ({ state, supplied }) => [
    Transition.set(state.at, supplied.now),
    Transition.set(state.by, supplied.who),
  ],
})
holds<
  Equals<
    Transition.Transition<
      typeof Stamped.Type,
      {},
      never,
      { readonly now: number; readonly who: string }
    >,
    typeof Stamp
  >
>()
void Transition.step(Stamp, { at: 0, by: '' }, {}, { now: 1, who: 'a' })
// @ts-expect-error a transition that declares supplied values is given them
void Transition.step(Stamp, { at: 0, by: '' }, {})
// @ts-expect-error a supplied value of another type
void Transition.step(Stamp, { at: 0, by: '' }, {}, { now: '1', who: 'a' })
const Plain = Transition.make({
  state: Stamped,
  input: Schema.Struct({ at: Schema.Int }),
  apply: ({ state, input }) => [Transition.add(state.at, input.at)],
})
void Transition.step(Plain, { at: 0, by: '' }, { at: 1 })
Transition.make({
  state: Stamped,
  input: Schema.Struct({}),
  supplied: { now: Schema.Int },
  // @ts-expect-error a supplied value read as another type
  apply: ({ state, supplied }) => [Transition.set(state.by, supplied.now)],
})
Transition.make({
  state: Stamped,
  input: Schema.Struct({}),
  // @ts-expect-error Transition.add takes a number field
  apply: ({ state }) => [Transition.add(state.by, 1)],
})

// A path to an Option field reads as the value or null, and a write takes null.
const Model = Schema.Struct({
  editingId: Schema.OptionFromNullOr(Schema.String),
  undo: Schema.Option(Schema.Struct({ id: Schema.String, title: Schema.String })),
})
const model = Path.forSchema(Model)
holds<Equals<typeof model.editingId, PathAccessor<typeof Model.Type, Option.Option<string>>>>()
const editingId: Path.Path<typeof Model.Type, string | null> = model.editingId
const undoTitle: Expr.Expr<typeof Model.Type, string | null> = model.undo.title
void editingId
void undoTitle
// @ts-expect-error the value read is not an Option
const asOption: Expr.Expr<typeof Model.Type, Option.Option<string>> = model.editingId
void asOption
Transition.make({
  state: Model,
  input: Schema.Struct({ id: Schema.String }),
  when: ({ state }) => Eq.isNot(state.editingId, null),
  apply: ({ state, input }) => [
    Transition.set(state.editingId, input.id),
    Transition.set(state.undo, null),
  ],
})
Transition.make({
  state: Model,
  input: Schema.Struct({}),
  // @ts-expect-error a write of an Option is a write of the value or null
  apply: ({ state }) => [Transition.set(state.editingId, Option.none())],
})

// The operations SQL's nulls reach say so in their types.
const Row = Schema.Struct({
  n: Schema.NullOr(Schema.Int),
  m: Schema.Int,
  s: Schema.NullOr(Schema.String),
})
const row = Path.forSchema(Row)
const equalsNullable = Eq.equals(row.n, 3)
holds<Equals<typeof equalsNullable, Expr.Expr<typeof Row.Type, boolean | null>>>()
const equalsValues: Expr.Expr<typeof Row.Type, boolean> = Eq.equals(row.m, 3)
const amongValues: Expr.Expr<typeof Row.Type, boolean> = Eq.among(row.m, [1, 2])
const amongNull: Expr.Expr<typeof Row.Type, boolean | null> = Eq.among(row.m, [1, null])
// @ts-expect-error a candidate beside a null may make it null
const amongNotNull: Expr.Expr<typeof Row.Type, boolean> = Eq.among(row.m, [1, null])
// @ts-expect-error a candidate of another type
void Eq.among(row.m, ['1'])
const coalesced: Expr.Expr<typeof Row.Type, string> = Null.coalesce(row.s, '')
// @ts-expect-error a fallback of another type
void Null.coalesce(row.s, 1)
const folded: Expr.Expr<typeof Row.Type, string | null> = Str.lowerAscii(Str.trim(row.s))
const ordered: Expr.Expr<typeof Row.Type, boolean | null> = Str.lt(row.s, 'm')
// @ts-expect-error text order takes text
void Str.lt(row.m, 'm')
void [equalsValues, amongValues, amongNull, amongNotNull, coalesced, folded, ordered]

import * as Operation from '../src/operation.js'

// A foreign operation is declared through metakit/operation and called directly.
const twice = Operation.define({
  id: 'app.twice',
  version: 1,
  args: [Schema.Number],
  returns: Schema.Number,
  nulls: 'strict',
})
const doubled: Expr.Expr<typeof Row.Type, number | null> = twice(row.n)
void doubled
// @ts-expect-error Node.foreign is removed; use Operation.define
Node.foreign({ id: 'app.x', version: 1, returns: 'number', nulls: 'strict' })
