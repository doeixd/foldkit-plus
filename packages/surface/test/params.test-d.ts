/**
 * The params argument of `Surface.read`, `contract` and `inspect` (#268): a
 * Surface that declares params cannot be read without them, and one without
 * params needs no argument.
 */
import { Schema } from 'effect'
import { Projection, Surface } from '../src/index.js'
import { App, Model } from './todoFixture.js'

type Root = typeof Model.Type

const Board = App.surface('Board', {
  model: ({ model }) => ({ todos: model.todos }),
})

const Card = App.surface('Card', {
  params: { id: Schema.String },
  model: ({ model, params }) => ({
    id: Projection.fromReader(Schema.String, () => params.id, { dependencies: [] }),
    todos: model.todos,
  }),
})

declare const root: Root

export const board = Surface.read(Board, root).todos
export const boardGivenUndefined = Surface.read(Board, root, undefined).todos
export const card: string = Surface.read(Card, root, { id: 't1' }).id
export const boardContract = Surface.contract(Board)
export const boardInspection = Surface.inspect(Board)
export const cardContract = Surface.contract(Card, { id: 't1' })
export const cardInspection = Surface.inspect(Card, { id: 't1' })

// @ts-expect-error: Card declares params
export const cardWithout = Surface.read(Card, root)

// @ts-expect-error: Card declares params
export const cardContractWithout = Surface.contract(Card)

// @ts-expect-error: Card declares params
export const cardInspectionWithout = Surface.inspect(Card)

// The Surface declared in the call: its params are inferred from the same argument.
export const inline: string = Surface.read(
  App.surface('InlineCard', {
    params: { id: Schema.String },
    model: () => ({
      id: Projection.fromReader(Schema.String, () => 'x', { dependencies: [] }),
    }),
  }),
  root,
  { id: 't1' },
).id

// @ts-expect-error: the inline Surface declares params
export const inlineWithout = Surface.read(
  App.surface('InlineCard', {
    params: { id: Schema.String },
    model: ({ model }) => ({ todos: model.todos }),
  }),
  root,
)

// A Surface whose params may be absent, or one typed `any`, may be read without them.
declare const optional: Surface<Root, { readonly n: number }, never, { readonly id: string } | void>
declare const untyped: Surface<Root, { readonly n: number }, never, any>
export const optionalWithout: number = Surface.read(optional, root).n
export const untypedWithout: number = Surface.read(untyped, root).n
