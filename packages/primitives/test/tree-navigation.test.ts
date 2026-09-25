/**
 * TreeNavigation: which rows show, what each key does from a row, the placed
 * transitions with either default, and the Behavior's ARIA attributes, roving
 * tab stop, and key handling on the container.
 */
import { Option, Schema } from 'effect'
import type { KeyboardModifiers } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Attributes, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { TreeNavigation } from '../src/interaction/index.js'

const { move, shown, tabStop, isOpen } = TreeNavigation
type Row = TreeNavigation.Row

const plain: KeyboardModifiers = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }

//   docs
//     intro
//     guide
//       setup
//   readme
const rows: ReadonlyArray<Row> = [
  { id: 'docs', parent: null, branch: true },
  { id: 'intro', parent: 'docs', branch: false },
  { id: 'guide', parent: 'docs', branch: true },
  { id: 'setup', parent: 'guide', branch: false },
  { id: 'readme', parent: null, branch: false },
]
const open = { openByDefault: true }
const closed = { openByDefault: false }
const none: TreeNavigation.Model = { current: null, toggled: [] }

const ids = (list: ReadonlyArray<{ readonly id: string }>) => list.map(row => row.id)

describe('shown', () => {
  it('shows every row whose ancestors are open, with its level and place', () => {
    expect(ids(shown(rows, none, open))).toEqual(['docs', 'intro', 'guide', 'setup', 'readme'])
    expect(shown(rows, none, open).map(row => [row.level, row.position, row.siblings])).toEqual([
      [1, 1, 2],
      [2, 1, 2],
      [2, 2, 2],
      [3, 1, 1],
      [1, 2, 2],
    ])
  })

  it('hides what a closed row holds, all the way down', () => {
    expect(ids(shown(rows, none, closed))).toEqual(['docs', 'readme'])
    expect(ids(shown(rows, { current: null, toggled: ['docs'] }, closed))).toEqual([
      'docs',
      'intro',
      'guide',
      'readme',
    ])
    expect(ids(shown(rows, { current: null, toggled: ['docs'] }, open))).toEqual(['docs', 'readme'])
  })

  it('treats a row whose parent is not a row as top-level', () => {
    expect(shown([{ id: 'orphan', parent: 'gone', branch: false }], none, open)[0]?.level).toBe(1)
  })
})

describe('move', () => {
  const all = shown(rows, none, open)
  const at = (current: string | null, key: string, model = none, args = open) =>
    move(shown(rows, model, args), current, key, plain, model, args)

  it.each<[string, string | null, string, TreeNavigation.Action | undefined]>([
    ['Down steps to the next row showing', 'intro', 'ArrowDown', { _tag: 'Focus', id: 'guide' }],
    ['Up steps back', 'guide', 'ArrowUp', { _tag: 'Focus', id: 'intro' }],
    ['Down stops at the last row', 'readme', 'ArrowDown', { _tag: 'Focus', id: 'readme' }],
    ['Home goes to the first row', 'setup', 'Home', { _tag: 'Focus', id: 'docs' }],
    ['End goes to the last row', 'docs', 'End', { _tag: 'Focus', id: 'readme' }],
    ['Right on an open row steps into it', 'guide', 'ArrowRight', { _tag: 'Focus', id: 'setup' }],
    ['Right on a leaf does nothing', 'intro', 'ArrowRight', undefined],
    ['Left on an open row closes it', 'guide', 'ArrowLeft', { _tag: 'Close', id: 'guide' }],
    [
      'Left on a leaf steps out to its parent',
      'setup',
      'ArrowLeft',
      { _tag: 'Focus', id: 'guide' },
    ],
    ['Left on a top-level leaf does nothing', 'readme', 'ArrowLeft', undefined],
    [
      'nothing current: Down lands on the first row',
      null,
      'ArrowDown',
      { _tag: 'Focus', id: 'docs' },
    ],
    ['nothing current: Up lands on the last row', null, 'ArrowUp', { _tag: 'Focus', id: 'readme' }],
    ['an unrelated key is ignored', 'docs', 'Enter', undefined],
  ])('%s', (_name, current, key, expected) => {
    expect(at(current, key)).toEqual(expected)
  })

  it('opens a closed row with Right, and steps out of a closed row with Left', () => {
    expect(at('docs', 'ArrowRight', none, closed)).toEqual({ _tag: 'Open', id: 'docs' })
    const model = { current: 'guide', toggled: ['guide'] }
    expect(at('guide', 'ArrowLeft', model, open)).toEqual({ _tag: 'Focus', id: 'docs' })
  })

  it('steps over a disabled row, and ignores ctrl, alt and meta', () => {
    const withDisabled = all.map(row => (row.id === 'guide' ? { ...row, disabled: true } : row))
    expect(move(withDisabled, 'intro', 'ArrowDown', plain, none, open)).toEqual({
      _tag: 'Focus',
      id: 'setup',
    })
    expect(move(all, 'intro', 'ArrowDown', { ...plain, altKey: true }, none, open)).toBeUndefined()
  })

  it('swaps Right and Left under rtl', () => {
    expect(move(all, 'guide', 'ArrowLeft', plain, none, open, 'rtl')).toEqual({
      _tag: 'Focus',
      id: 'setup',
    })
  })
})

describe('tabStop', () => {
  it('is the current row while it shows, else the first row', () => {
    expect(tabStop(shown(rows, none, open), 'guide')).toBe('guide')
    expect(tabStop(shown(rows, none, closed), 'guide')).toBe('docs')
    expect(tabStop(shown(rows, none, open), null)).toBe('docs')
  })
})

const Tree = Bundle.declare(TreeNavigation.bundle, 'layers')
const Model = Schema.Struct({ ...Tree.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Tree.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })

describe('TreeNavigation placement', () => {
  const send = (args: TreeNavigation.Args, model: Model, message: TreeNavigation.Message) =>
    Option.getOrThrow(Page.at(Tree, { args }).update(model, Tree.wrapper.make(message))).model
  const start: Model = { layers: none }

  it('remembers the focused row, and records only what differs from the default', () => {
    const closedDocs = send(open, start, TreeNavigation.Message.Closed({ id: 'docs' }))
    expect(closedDocs.layers.toggled).toEqual(['docs'])
    expect(isOpen(closedDocs.layers, open, 'docs')).toBe(false)
    const reopened = send(open, closedDocs, TreeNavigation.Message.Opened({ id: 'docs' }))
    expect(reopened.layers.toggled).toEqual([])
    // Opening what is already open changes nothing.
    expect(send(open, start, TreeNavigation.Message.Opened({ id: 'docs' })).layers).toBe(
      start.layers,
    )
    expect(
      send(closed, start, TreeNavigation.Message.Opened({ id: 'docs' })).layers.toggled,
    ).toEqual(['docs'])
    expect(send(open, start, TreeNavigation.Message.Focused({ id: 'intro' })).layers.current).toBe(
      'intro',
    )
  })
})

const TreeSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Focusable }),
})
const h = SlotView.inertBuilder<Message>()
const wire = TreeNavigation.behavior(Tree, open)(TreeSlots)<Model, Message>({
  container: 'root',
  item: 'row',
  rows: () => rows,
  domId: id => `layer-${id}`,
})
const builders = (model: Model) =>
  SlotView.buildersFor(TreeSlots, [wire.mixin], { input: model, h })

describe('TreeNavigation behavior', () => {
  const model: Model = { layers: { current: 'guide', toggled: [] } }

  it('writes each row’s place in the tree, and gives the current one the tab stop', () => {
    const b = builders(model)
    const guide = b.row.attrs([], { index: 2, id: 'guide' })
    expect(Attributes.find(guide, 'Id')?.value).toBe('layer-guide')
    expect(Attributes.find(guide, 'Role')?.value).toBe('treeitem')
    expect(Attributes.find(guide, 'AriaLevel')?.value).toBe(2)
    expect(Attributes.find(guide, 'AriaPosinset')?.value).toBe(2)
    expect(Attributes.find(guide, 'AriaSetsize')?.value).toBe(2)
    expect(Attributes.find(guide, 'AriaExpanded')?.value).toBe(true)
    expect(Attributes.find(guide, 'Tabindex')?.value).toBe(0)
    const intro = b.row.attrs([], { index: 1, id: 'intro' })
    expect(Attributes.find(intro, 'AriaExpanded')).toBeUndefined()
    expect(Attributes.find(intro, 'Tabindex')?.value).toBe(-1)
    expect(Attributes.find(intro, 'OnFocus')?.message).toEqual(
      Tree.wrapper.make(TreeNavigation.Message.Focused({ id: 'intro' })),
    )
  })

  it('moves focus to the row a key picks, and opens or closes in place', () => {
    const handler = Attributes.find(builders(model).root.attrs(), 'OnKeyDownFocus')?.f
    if (handler === undefined) throw new Error('no OnKeyDownFocus on the container')
    expect(Option.getOrThrow(handler('ArrowRight', plain))).toEqual({
      focusSelector: '[id="layer-setup"]',
      message: Tree.wrapper.make(TreeNavigation.Message.Focused({ id: 'setup' })),
    })
    expect(Option.getOrThrow(handler('ArrowLeft', plain))).toEqual({
      focusSelector: '[id="layer-guide"]',
      message: Tree.wrapper.make(TreeNavigation.Message.Closed({ id: 'guide' })),
    })
    expect(Option.isNone(handler('Enter', plain))).toBe(true)
  })

  it('works out the rows once per input, however many rows are drawn', () => {
    let asked = 0
    const counted = TreeNavigation.behavior(Tree, open)(TreeSlots)<Model, Message>({
      container: 'root',
      item: 'row',
      rows: () => {
        asked += 1
        return rows
      },
    })
    const draw = (input: Model) => {
      const b = SlotView.buildersFor(TreeSlots, [counted.mixin], { input, h })
      b.root.attrs()
      return rows.map((row, index) => b.row.attrs([], { index, id: row.id }))
    }
    draw(model)
    expect(asked).toBe(1)
    // A new input is worked out afresh: the tab stop follows it.
    const moved = draw({ layers: { current: 'intro', toggled: [] } })
    expect(asked).toBe(2)
    expect(moved.map(attrs => Attributes.find(attrs, 'Tabindex')?.value)).toEqual(
      rows.map(row => (row.id === 'intro' ? 0 : -1)),
    )
  })
})
