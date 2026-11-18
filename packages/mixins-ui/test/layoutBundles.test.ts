/**
 * The layout and disclosure widgets' Bundles placed with `foldkit-bundle`:
 * each starts from its args and folds its own Messages through the
 * placement, with the facts the args hold given to `update` once.
 */
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { Accordion, Bundles, Resizable, TreeView } from '../src/index.js'

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

describe('Bundles.TreeView', () => {
  const nodes = [
    { id: 'src', label: 'src', children: [{ id: 'index', label: 'index.ts' }] },
    { id: 'readme', label: 'README.md' },
  ]
  const Files = Bundle.compose({ note: Schema.String }).pipe(
    Bundle.withChild('files', Bundles.TreeView, {
      args: { id: 'files', nodes, checkable: true, open: ['src'] },
    }),
  )
  const step = Files.placements.update(model => ({ model }))
  const first = () => Files.placements.initial({ note: '' }).model

  it('starts from its args, checkable included', () => {
    expect(first().files).toMatchObject({ id: 'files', open: ['src'], checkable: true })
  })

  it('folds against the tree the args hold: Space checks the row the Model has current', () => {
    const focused = step(
      first(),
      Files.Message.GotFilesMessage({ message: TreeView.Message.Focused({ id: 'src' }) }),
    ).model
    const checked = step(
      focused,
      Files.Message.GotFilesMessage({ message: TreeView.Message.Pressed({ key: ' ' }) }),
    ).model
    expect(checked.files.checked).toEqual(['index'])
  })
})

describe('Bundles.Resizable', () => {
  const Split = Bundle.compose({ note: Schema.String }).pipe(
    Bundle.withChild('panes', Bundles.Resizable, { args: { share: 0.4, max: 0.6 } }),
  )
  const step = Split.placements.update(model => ({ model }))
  const first = () => Split.placements.initial({ note: '' }).model

  it('starts from its args, bounds included', () => {
    expect(first().panes).toMatchObject({ share: 0.4, bounds: { max: 0.6 } })
  })

  it('folds against the bounds the args hold', () => {
    const set = step(
      first(),
      Split.Message.GotPanesMessage({ message: Resizable.Message.Set({ share: 2 }) }),
    ).model
    expect(set.panes.share).toBe(0.6)
  })
})
