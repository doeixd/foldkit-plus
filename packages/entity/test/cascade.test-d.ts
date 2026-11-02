/** A cascade is declared on a `one` relation, with the one action there is (#343). */
import { Schema } from 'effect'
import { expectTypeOf } from 'vitest'
import { Entity, Relation, type RelationSpec } from '../src/index.js'

const UserFields = Entity.define('User', Schema.Struct({ id: Schema.String }))

expectTypeOf(Relation.one(UserFields, { onDelete: 'cascade' })).toEqualTypeOf<
  RelationSpec<typeof UserFields, 'one', false>
>()
expectTypeOf(Relation.one(UserFields, { optional: true, onDelete: 'cascade' })).toEqualTypeOf<
  RelationSpec<typeof UserFields, 'one', true>
>()

// @ts-expect-error setNull and restrict are not declared yet (#348)
Relation.one(UserFields, { onDelete: 'setNull' })

// @ts-expect-error a many is a view of the links from the other side, and declares nothing
Relation.many(UserFields, { onDelete: 'cascade' })
