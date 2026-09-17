/**
 * The history factory keeps the given name for keys and the Module, takes its
 * initial value as args, and rejects a bad capacity at the factory.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { expectTypeOf } from 'vitest'
import { Bundle } from 'foldkit-bundle'
import { history } from '../src/state/index.js'

const EditHistory = history({ name: 'EditHistory', value: Schema.String, capacity: 50 })
expectTypeOf(EditHistory.name).toEqualTypeOf<'EditHistory'>()

const Doc = Bundle.declare(EditHistory, 'doc')
const Model = Schema.Struct({ ...Doc.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Doc.cases })
const Page = Bundle.parent({ Model, Message })

// The initial value comes as args:
// @ts-expect-error: args is required
Page.at(Doc)

// The attached union constructs Messages like any exported one:
const push = EditHistory.Message.Push({ value: 'b' })
expectTypeOf(push._tag).toEqualTypeOf<'Push'>()
