/**
 * The layout and disclosure widgets' Bundles placed with `foldkit-bundle`:
 * each starts from its args and folds its own Messages through the
 * placement, with the facts the args hold given to `update` once.
 */
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { Accordion, Bundles } from '../src/index.js'

const App = Bundle.compose({ note: Schema.String }).pipe(
  Bundle.withChild('faq', Bundles.Accordion, { args: { open: ['a'], multiple: true } }),
  Bundle.withChild('one', Bundles.Accordion, { args: { open: ['a'], collapsible: false } }),
)
const update = App.placements.update(model => ({ model }))
const start = () => App.placements.initial({ note: '' }).model

describe('Bundles.Accordion', () => {
  it('starts from its args', () => {
    expect(start().faq).toEqual({ open: ['a'] })
  })

  it('holds multiple and collapsible once, for every press', () => {
    const faq = update(
      start(),
      App.Message.GotFaqMessage({ message: Accordion.Message.Toggled({ id: 'b' }) }),
    ).model
    expect(faq.faq.open).toEqual(['a', 'b'])
    const shut = update(
      start(),
      App.Message.GotOneMessage({ message: Accordion.Message.Toggled({ id: 'a' }) }),
    ).model
    expect(shut.one.open).toEqual(['a'])
  })
})
