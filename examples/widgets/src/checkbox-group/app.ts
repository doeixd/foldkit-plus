/**
 * A topping group's state: one `Selection` placement in multiple mode. Each
 * activation toggles that topping; the native checkboxes are the floor, so
 * no toggle or pressed behavior is involved.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Selection } from 'foldkit-primitives/interaction'

export const TOPPINGS = ['cheese', 'pepperoni', 'mushrooms'] as const
export type Topping = (typeof TOPPINGS)[number]

export const Sel = Bundle.declare(Selection.bundle, 'toppings')

export const selArgs = { mode: 'multiple', allowEmpty: true } as const

export const Model = Schema.Struct({
  ...Sel.fields,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Sel.cases,
})
export type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })

const assembly = Parent.assemble(Parent.at(Sel, { args: selArgs }))

export const initial = assembly.initial({})

export const update = assembly.update()

export const selectedOf = (model: Model): ReadonlyArray<string> => model.toppings.selected
