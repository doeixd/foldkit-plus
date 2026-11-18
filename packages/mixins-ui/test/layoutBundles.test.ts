/**
 * The layout and disclosure widgets' Bundles placed with `foldkit-bundle`:
 * each starts from its args and folds its own Messages through the
 * placement, with the facts the args hold given to `update` once.
 */
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import * as UiVirtualList from '@foldkit/ui/virtualList'
import { Accordion, Bundles, FloatingPanel, Resizable, Tour, TreeView } from '../src/index.js'

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

describe('Bundles.FloatingPanel', () => {
  const Windows = Bundle.compose({ order: Schema.Array(Schema.String) }).pipe(
    Bundle.withChild('notes', Bundles.FloatingPanel, {
      args: { id: 'notes', rect: { x: 10, y: 10, width: 300, height: 200 }, grid: 50 },
      onOut: out => model => ({
        model: { ...model, order: FloatingPanel.raise(model.order, out.id) },
      }),
    }),
  )
  const step = Windows.placements.update(model => ({ model }))
  const first = () => Windows.placements.initial({ order: ['chat', 'notes'] }).model

  it('starts from its args, limits included', () => {
    expect(first().notes).toMatchObject({ id: 'notes', open: false, limits: { grid: 50 } })
  })

  it('folds against the limits the args hold', () => {
    const held = step(
      step(
        first(),
        Windows.Message.GotNotesMessage({
          message: FloatingPanel.Message.GestureStarted({ handle: 'move' }),
        }),
      ).model,
      Windows.Message.GotNotesMessage({
        message: FloatingPanel.Message.GestureMoved({ deltaX: 30, deltaY: 0 }),
      }),
    ).model
    expect(held.notes.rect.x).toBe(60)
  })

  it('docks to an edge of the viewport through helpers.dock', () => {
    const measured = step(
      first(),
      Windows.Message.GotNotesMessage({
        message: FloatingPanel.Message.Measured({ width: 1000, height: 800 }),
      }),
    ).model
    const docked = Windows.children.notes.helpers.dock('left', 250)(measured).model
    expect(docked.notes.rect).toEqual({ x: 0, y: 0, width: 250, height: 800 })
  })

  it('reports Raised, which the placement folds into the order', () => {
    const raised = step(
      first(),
      Windows.Message.GotNotesMessage({ message: FloatingPanel.Message.Activated() }),
    ).model
    expect(raised.order).toEqual(['chat', 'notes'])
    const behind = step(
      Windows.placements.initial({ order: ['notes', 'chat'] }).model,
      Windows.Message.GotNotesMessage({ message: FloatingPanel.Message.Activated() }),
    ).model
    expect(behind.order).toEqual(['chat', 'notes'])
  })
})

describe('Bundles.Tour', () => {
  const Guide = Bundle.compose({ finished: Schema.Boolean }).pipe(
    Bundle.withChild('tour', Bundles.Tour, {
      args: { id: 'guide', steps: [{ title: 'One', description: 'The only step.' }] },
      onOut: out => model => ({ model: { ...model, finished: out.completed } }),
    }),
  )
  const step = Guide.placements.update(model => ({ model }))

  it('holds its steps, which update reads, and reports Ended', () => {
    const begun = Guide.children.tour.helpers.start()(
      Guide.placements.initial({ finished: false }).model,
    ).model
    expect(begun.tour.steps).toHaveLength(1)
    const done = step(begun, Guide.Message.GotTourMessage({ message: Tour.Message.Next() })).model
    expect(done.tour.open).toBe(false)
    expect(done.finished).toBe(true)
  })
})

describe('Bundles.VirtualList', () => {
  const Feed = Bundle.compose({ asked: Schema.Number }).pipe(
    Bundle.withChild('rows', Bundles.VirtualList, {
      args: { id: 'rows', rowHeightPx: 30, nearEndPx: 100 },
      onOut: () => model => ({ model: { ...model, asked: model.asked + 1 } }),
    }),
  )
  const step = Feed.placements.update(model => ({ model }))
  const scrolled = (scrollTop: number) =>
    Feed.Message.GotRowsMessage({
      message: UiVirtualList.Message.ObservedContainerScroll({
        scrollTop,
        scrollHeight: 1000,
        containerHeight: 300,
        anchor: { _tag: 'None' },
      }),
    })

  it('reports NearEnd once as a scroll crosses into the band, not while it stays there', () => {
    const start = Feed.placements.initial({ asked: 0 }).model
    const far = step(start, scrolled(500)).model
    expect(far.asked).toBe(0)
    const near = step(far, scrolled(650)).model
    expect(near.asked).toBe(1)
    expect(step(near, scrolled(680)).model.asked).toBe(1)
  })
})

describe('Bundles.WindowList', () => {
  const Page = Bundle.compose({}).pipe(
    Bundle.withChild('list', Bundles.WindowList, { args: { id: 'list', estimatedHeight: 40 } }),
  )

  it('starts from its args and reveals a row by a Command', () => {
    const start = Page.placements.initial({}).model
    expect(start.list).toMatchObject({ id: 'list', estimatedHeight: 40 })
    const revealed = Page.children.list.helpers.reveal(12)(start)
    expect(revealed.model).toBe(start)
    expect(revealed.commands?.map(command => command.name)).toEqual(['WindowList.Reveal'])
  })
})
