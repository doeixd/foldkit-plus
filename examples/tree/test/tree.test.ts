import { describe, expect, it } from 'vitest'
import { Option } from 'effect'
import type { KeyboardModifiers } from 'foldkit/html'
import { Attributes, SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Selection, TreeNavigation } from 'foldkit-primitives/interaction'
import { Nav, Sel, initial, navArgs, update, type Message, type Model } from '../src/app.js'
import { Tree, TreeKeys, TreePicks, TreeSlots, toggleOf } from '../src/view.js'

const openedSrc = (model: Model): Model =>
  update(model, Nav.wrapper.make(TreeNavigation.Message.Opened({ id: 'src' }))).model

const start: Model = initial.model

const plain: KeyboardModifiers = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }

describe('update flows', () => {
  it('starts closed with nothing selected', () => {
    expect(start.nav).toEqual({ current: null, toggled: [] })
    expect(start.selection).toEqual({ selected: [], anchor: null })
  })

  it('opens a branch and shows its children', () => {
    const next = openedSrc(start)
    expect(next.nav.toggled).toEqual(['src'])
    expect(TreeNavigation.isOpen(next.nav, navArgs, 'src')).toBe(true)
    expect(TreeNavigation.isOpen(next.nav, navArgs, 'components')).toBe(false)
  })

  it('toggles a branch closed again', () => {
    const open = openedSrc(start)
    const shut = update(open, Nav.wrapper.make(TreeNavigation.Message.Closed({ id: 'src' }))).model
    expect(shut.nav.toggled).toEqual([])
  })

  it('selects on click and commits focus on Enter', () => {
    const clicked = update(
      start,
      Sel.wrapper.make(Selection.Message.Activated({ id: 'readme' })),
    ).model
    expect(clicked.selection.selected).toEqual(['readme'])
    const focused = update(
      clicked,
      Nav.wrapper.make(TreeNavigation.Message.Focused({ id: 'docs' })),
    ).model
    expect(focused.selection.selected).toEqual(['readme'])
    const committed = update(focused, { _tag: 'CommittedCurrent' }).model
    expect(committed.selection.selected).toEqual(['docs'])
  })

  it('committing with no focus selects nothing', () => {
    expect(update(start, { _tag: 'CommittedCurrent' }).model).toBe(start)
  })
})

describe('view structure', () => {
  it('draws closed roots with collapsed branches', () => {
    const tree = Inert.draw(Tree, start)
    const rows = Inert.byRole(tree, 'treeitem')
    expect(rows).toHaveLength(3)
    expect(Inert.value(rows[0], 'aria-expanded')).toBe('false')
    expect(Inert.value(rows[1], 'aria-expanded')).toBe('false')
    expect(Inert.value(rows[2], 'aria-expanded')).toBeUndefined()
    expect(Inert.byLabel(tree, 'Expand src')).toHaveLength(1)
    expect(Inert.byLabel(tree, 'components')).toHaveLength(0)
  })

  it('draws children with levels once open', () => {
    const tree = Inert.draw(Tree, openedSrc(start))
    const rows = Inert.byRole(tree, 'treeitem')
    expect(rows).toHaveLength(5)
    const components = rows[1]!
    expect(Inert.value(components, 'aria-level')).toBe('2')
    expect(Inert.value(components, 'aria-posinset')).toBe('1')
    expect(Inert.value(components, 'aria-setsize')).toBe('2')
  })

  it('marks the selected row and stops the tab on the focused one', () => {
    const selected = update(
      update(start, Sel.wrapper.make(Selection.Message.Activated({ id: 'docs' }))).model,
      Nav.wrapper.make(TreeNavigation.Message.Focused({ id: 'docs' })),
    ).model
    const tree = Inert.draw(Tree, selected)
    const rows = Inert.byRole(tree, 'treeitem')
    expect(Inert.value(rows[1], 'aria-selected')).toBe('true')
    expect(Inert.value(rows[0], 'aria-selected')).toBe('false')
    expect(Inert.value(rows[1], 'tabIndex')).toBe(0)
    expect(Inert.value(rows[0], 'tabIndex')).toBe(-1)
  })

  it('marks disabled rows without a click', () => {
    const open = update(
      openedSrc(start),
      Nav.wrapper.make(TreeNavigation.Message.Opened({ id: 'components' })),
    ).model
    const h = SlotView.inertBuilder<Message>()
    const builders = SlotView.buildersFor(TreeSlots, [TreeKeys.mixin, TreePicks.mixin], {
      input: open,
      h,
    })
    const dialog = builders.row.attrs([], { index: 3, id: 'dialog' })
    expect(Attributes.find(dialog, 'AriaDisabled')?.value).toBe(true)
    expect(Attributes.find(dialog, 'OnClick')).toBeUndefined()
  })
})

describe('handler wiring', () => {
  const h = SlotView.inertBuilder<Message>()
  const keysOf = (model: Model) =>
    SlotView.buildersFor(TreeSlots, [TreeKeys.mixin], { input: model, h })
  const picksOf = (model: Model) =>
    SlotView.buildersFor(TreeSlots, [TreePicks.mixin], { input: model, h })

  it('Right on a closed branch opens it', () => {
    const handler = Attributes.find(keysOf(start).tree.attrs(), 'OnKeyDownFocus')?.f
    if (handler === undefined) throw new Error('no OnKeyDownFocus on the tree')
    expect(Option.getOrThrow(handler('ArrowRight', plain))).toEqual({
      focusSelector: '[id="src"]',
      message: Nav.wrapper.make(TreeNavigation.Message.Focused({ id: 'src' })),
    })
    const focused = update(
      start,
      Nav.wrapper.make(TreeNavigation.Message.Focused({ id: 'src' })),
    ).model
    const again = Attributes.find(keysOf(focused).tree.attrs(), 'OnKeyDownFocus')?.f
    if (again === undefined) throw new Error('no OnKeyDownFocus on the tree')
    expect(Option.getOrThrow(again('ArrowRight', plain))).toEqual({
      focusSelector: '[id="src"]',
      message: Nav.wrapper.make(TreeNavigation.Message.Opened({ id: 'src' })),
    })
  })

  it('a row click selects through the selection placement', () => {
    const row = picksOf(openedSrc(start)).row.attrs([], { index: 2, id: 'index' })
    expect(Attributes.find(row, 'OnClick')?.message).toEqual(
      Sel.wrapper.make(Selection.Message.Activated({ id: 'index' })),
    )
  })

  it('toggling follows the branch state', () => {
    expect(toggleOf(start, 'src')).toEqual(
      Nav.wrapper.make(TreeNavigation.Message.Opened({ id: 'src' })),
    )
    expect(toggleOf(openedSrc(start), 'src')).toEqual(
      Nav.wrapper.make(TreeNavigation.Message.Closed({ id: 'src' })),
    )
  })
})
