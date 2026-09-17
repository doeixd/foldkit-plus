/**
 * Args as a Schema: inference without annotations, presets, and the check at
 * placement.
 */
import { Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { describe, expect, it } from 'vitest'
import { Bundle } from '../src/index.js'

const MediaQueryModel = Schema.Struct({ matches: Schema.Boolean, query: Schema.String })
type MediaQueryModel = typeof MediaQueryModel.Type
const MediaQueryMessage = defineMessageUnion({ Changed: { matches: Schema.Boolean } })
type MediaQueryMessage = typeof MediaQueryMessage.Type

export const MediaQuery = Bundle.make('MediaQuery', {
  Model: MediaQueryModel,
  Message: MediaQueryMessage,
  args: Schema.Struct({ query: Schema.String }),
  // No annotations: `query` is typed from the args Schema.
  init: ({ query }) => ({ model: { matches: false, query } }),
  update: (model, message, { query }) => ({ model: { ...model, matches: message.matches, query } }),
  subscriptions: ({ query }) =>
    Subscription.make<MediaQueryModel, MediaQueryMessage>()(() => ({
      changes: Subscription.persistent(
        Stream.make(MediaQueryMessage.Changed({ matches: query.length > 0 })),
      ),
    })),
})

const Dark = MediaQuery.with({ query: '(prefers-color-scheme: dark)' })
const Model = Schema.Struct({ dark: MediaQueryModel, narrow: MediaQueryModel })
const Message = defineMessageUnion({
  ...Bundle.declare(Dark, 'dark').cases,
  ...Bundle.declare(MediaQuery, 'narrow').cases,
})
const Page = Bundle.parent({ Model, Message })

describe('args as a Schema', () => {
  it('binds a preset’s args into init and update, so placing needs none', () => {
    const placed = Page.place(Dark, 'dark')
    const initial = placed.init({
      dark: { matches: true, query: '' },
      narrow: { matches: false, query: '' },
    })
    expect(initial.model.dark).toEqual({ matches: false, query: '(prefers-color-scheme: dark)' })
    expect(placed.argsSummary).toBe('{"query":"(prefers-color-scheme: dark)"}')
  })

  it('records a placement’s args encoded, for Module', () => {
    const placed = Page.place(MediaQuery, 'narrow', { args: { query: '(max-width: 40rem)' } })
    expect(placed.argsSummary).toBe('{"query":"(max-width: 40rem)"}')
  })

  it('refuses args that bypass the types, naming the placement', () => {
    const untyped = { query: 42 } as unknown as { readonly query: string }
    expect(() => Page.place(MediaQuery, 'narrow', { args: untyped })).toThrow(
      /MediaQuery@narrow: args do not match the bundle's args Schema/,
    )
    expect(() => MediaQuery.with(untyped)).toThrow(/MediaQuery: args do not match/)
  })
})
