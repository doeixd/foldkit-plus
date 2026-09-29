/**
 * The pre-init seam: a `Bootstrap` folds pre-read keys into the initial Model
 * synchronously, before the first render. `Wiring.init` is the other
 * lifecycle: startup Commands after the Model exists, whose answer arrives
 * later through `update`.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Mirror, type Bootstrap, type Encoded } from '../src/index.js'

const Model = Schema.Struct({
  filter: Schema.Literals(['all', 'active']),
  page: Schema.Number,
  draft: Schema.String,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Mirror.messages })
const initial: Model = { filter: 'all', page: 1, draft: '' }
const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })

const Filters = Mirror.url(App, { name: 'filters', fields: [App.model.filter, App.model.page] })
const Prefs = Mirror.kv(App, { key: 'prefs', fields: [App.model.draft] })
const Numbers = Mirror.kv(App, { key: 'numbers', fields: [App.model.page] })
// A second key-value mirror over the URL mirror's field: cold-load precedence
// (URL, then store, then initial) is what the order tests pin.
const Also = Mirror.kv(App, { key: 'also', fields: [App.model.filter] })

describe('a store bootstrap', () => {
  it('applies pre-read keys before the first render, as a pure function', () => {
    const step: Bootstrap<Model> = Prefs.bootstrap({ draft: 'saved' })
    expect(step(initial)).toEqual({ ...initial, draft: 'saved' })
  })

  it('keeps a value set before it, like the restore it replaces', () => {
    const typed = { ...initial, draft: 'typed' }
    expect(Prefs.bootstrap({ draft: 'saved' })(typed)).toBe(typed)
  })

  it('drops a key that fails to decode, keeping the initial value', () => {
    expect(Numbers.bootstrap({ page: 'abc' })(initial)).toBe(initial)
    expect(Numbers.bootstrap({ page: '2' })(initial)).toEqual({ ...initial, page: 2 })
  })

  it('is the conservative read, not the whole-slice one', () => {
    const typed = { ...initial, draft: 'typed' }
    expect(Prefs.bootstrap({ draft: 'saved' })(typed)).toBe(
      Prefs.restoreKeys(typed, { draft: 'saved' }),
    )
  })
})

describe('Mirror.bootstrap', () => {
  it('folds store steps and the URL step into the initial Model', () => {
    expect(
      Mirror.bootstrap(initial, Prefs.bootstrap({ draft: 'saved' }), model =>
        Filters.reduce(model, '/list?filter=active'),
      ),
    ).toEqual({ ...initial, filter: 'active', draft: 'saved' })
  })

  it('keeps URL > store > initial with the URL listed last', () => {
    expect(
      Mirror.bootstrap(initial, Also.bootstrap({ filter: 'active' }), model =>
        Filters.reduce(model, '/list'),
      ).filter,
    ).toBe('all')
  })

  it('keeps URL > store > initial with the URL listed first', () => {
    expect(
      Mirror.bootstrap(
        initial,
        model => Filters.reduce(model, '/list?filter=active'),
        Also.bootstrap({ filter: 'all' }),
      ).filter,
    ).toBe('active')
  })

  it('with no steps returns the Model it was given', () => {
    expect(Mirror.bootstrap(initial)).toBe(initial)
  })

  it('among store bootstraps sharing a field, the first one wins', () => {
    const Other = Mirror.kv(App, { key: 'other', fields: [App.model.draft] })
    expect(
      Mirror.bootstrap(
        initial,
        Prefs.bootstrap({ draft: 'first' }),
        Other.bootstrap({ draft: 'second' }),
      ).draft,
    ).toBe('first')
  })

  it('is how Flags become the initial Model: keys the server embedded, read synchronously', () => {
    const init = (flags: { readonly prefs: Encoded }, url: string): Model =>
      Mirror.bootstrap(initial, Prefs.bootstrap(flags.prefs), model => Filters.reduce(model, url))
    expect(init({ prefs: { draft: 'saved' } }, '/list?filter=active')).toEqual({
      ...initial,
      filter: 'active',
      draft: 'saved',
    })
  })

  it('a bootstrapped value wins over a later restore for the fields it set', () => {
    const bootstrapped = Prefs.bootstrap({ draft: 'from-flags' })(initial)
    expect(
      Prefs.reduce(bootstrapped, {
        _tag: 'MirrorRestored',
        name: 'prefs',
        keys: { draft: 'from-store' },
      }),
    ).toBe(bootstrapped)
  })
})

describe('the seam separation', () => {
  it('a bootstrap is pure: no Command, no Message, no Effect', () => {
    const step = Prefs.bootstrap({ draft: 'saved' })
    expect(typeof step).toBe('function')
    expect(step(initial)).toEqual({ ...initial, draft: 'saved' })
    expect(Prefs.restore).toHaveProperty('effect')
  })

  it('wiring carries no bootstrap: startup Commands stay on Wiring.init', () => {
    expect('bootstrap' in Prefs.wiring()).toBe(false)
    expect('bootstrap' in Filters.wiring('UrlChanged')).toBe(false)
    expect(Prefs.wiring().init(initial).commands).toEqual([Prefs.restore])
  })
})
