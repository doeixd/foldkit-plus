/**
 * Writes over a field that holds null from an optional input key of each
 * encoding: left out (`optionalKey`), an `Option` stored as null
 * (`OptionFromNullOr`), and a plain null (`NullOr`). Read by
 * `phase1Gate.test.ts` and declared for the step-6 differential.
 */
import { Schema } from 'effect'
import { Entity, Write } from '../src/index.js'

export const Note = Entity.define(
  'Note',
  Schema.Struct({
    id: Schema.String,
    note: Schema.NullOr(Schema.String),
    n: Schema.Finite,
  }),
)

/** Left out keeps the field; null sets it to null. */
export const ByOptionalKey = Write.update(
  Entity.input(
    Note,
    Schema.Struct({ id: Schema.String, note: Schema.optionalKey(Schema.NullOr(Schema.String)) }),
  ),
  { id: 'id' },
)

/** `Option.none()`, stored as null, keeps the field. */
export const ByOption = Write.update(
  Entity.input(
    Note,
    Schema.Struct({ id: Schema.String, note: Schema.OptionFromNullOr(Schema.String) }),
  ),
  { id: 'id' },
)

/** Null sets the field to null. */
export const ByNull = Write.update(
  Entity.input(Note, Schema.Struct({ id: Schema.String, note: Schema.NullOr(Schema.String) })),
  { id: 'id' },
)

/** Moves `n` by an amount any finite number may be. */
export const Moved = Write.update(
  Entity.input(Note, Schema.Struct({ id: Schema.String, by: Schema.Finite }), {
    by: Entity.unmapped,
  }),
  { id: 'id', increment: { n: 'by' } },
)
