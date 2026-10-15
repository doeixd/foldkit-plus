/**
 * TreeView as a transition and as markup: the keys move over the rows
 * showing, stepping over shut and disabled ones, open and shut a row or
 * step in and out, a character moves to the next showing row it starts,
 * Enter and a click choose, and the drawn tree carries each row's place,
 * depth and state with one tab stop.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Patterns, Recipes, TreeView, TreeViewSlots } from '../src/index.js'
import { h, message } from './fixture.js'

const { Message, init } = TreeView

const FILES: ReadonlyArray<TreeView.TreeNode> = [
  {
    id: 'src',
    label: 'src',
    children: [
      {
        id: 'components',
        label: 'components',
        children: [
          { id: 'button', label: 'button.ts' },
          { id: 'tree', label: 'tree.ts' },
        ],
      },
      { id: 'index', label: 'index.ts' },
    ],
  },
  { id: 'locked', label: 'locked.ts', disabled: true },
  { id: 'readme', label: 'README.md' },
  { id: 'package', label: 'package.json' },
]

const update = TreeView.update(FILES)

const at = (open: ReadonlyArray<string>, current: Option.Option<string>): TreeView.Model => ({
  ...init({ id: 'files', open }),
  current,
})
const press = (model: TreeView.Model, key: string) => update(model, Message.Pressed({ key }))
const names = (result: ReturnType<typeof update>) =>
  (result.commands ?? []).map(command => command.name)

describe('TreeView.update', () => {
  it.each([
    ['Down with nothing current lands on the first row', [], undefined, 'ArrowDown', 'src'],
    ['Down steps over a disabled row', [], 'src', 'ArrowDown', 'readme'],
    ['Down steps over the rows of a shut row', ['src'], 'components', 'ArrowDown', 'index'],
    ['Down steps into an open row', ['src', 'components'], 'components', 'ArrowDown', 'button'],
    ['Up steps over a disabled row', [], 'readme', 'ArrowUp', 'src'],
    ['End lands on the last row showing', ['src'], 'src', 'End', 'package'],
    ['Home lands on the first row', [], 'package', 'Home', 'src'],
    ['Right on an open row steps into it', ['src'], 'src', 'ArrowRight', 'components'],
    ['Left on a shut row steps out to its parent', ['src'], 'components', 'ArrowLeft', 'src'],
    ['a character moves to the next row it starts', [], 'src', 'r', 'readme'],
    ['a character finds an open row’s rows', ['src', 'components'], 'button', 't', 'tree'],
  ] as const)('%s, and focuses it', (_, open, current, key, to) => {
    const result = press(at(open, Option.fromUndefinedOr(current)), key)
    expect(result.model.current).toEqual(Option.some(to))
    expect(names(result)).toEqual(['FocusItem'])
  })

  it('a character skips the rows of a shut row', () => {
    const model = at([], Option.some('src'))
    expect(press(model, 'b').model).toBe(model)
  })

  it('Right opens a shut row and Left shuts an open one, focus staying', () => {
    const opened = press(at([], Option.some('src')), 'ArrowRight')
    expect(opened.model.open).toEqual(['src'])
    expect(opened.model.current).toEqual(Option.some('src'))
    expect(names(opened)).toEqual([])
    expect(press(opened.model, 'ArrowLeft').model.open).toEqual([])
  })

  it('keys faster than a frame each move on from the last', () => {
    const first = press(at([], Option.some('src')), 'ArrowRight')
    const second = press(first.model, 'ArrowRight')
    expect(press(second.model, 'ArrowRight').model.open).toEqual(['src', 'components'])
  })

  it('Enter chooses a row, opening or shutting one that holds rows', () => {
    const chosen = press(at([], Option.some('src')), 'Enter').model
    expect(chosen.selected).toEqual(Option.some('src'))
    expect(chosen.open).toEqual(['src'])
    expect(press(chosen, ' ').model.open).toEqual([])
    const leaf = press(at([], Option.some('readme')), 'Enter').model
    expect(leaf.selected).toEqual(Option.some('readme'))
    expect(press(leaf, 'Enter').model).toBe(leaf)
  })

  it('a click chooses a row and makes it current', () => {
    const { model } = update(at([], Option.none()), Message.Clicked({ id: 'package' }))
    expect(model.selected).toEqual(Option.some('package'))
    expect(model.current).toEqual(Option.some('package'))
  })

  it.each([
    ['a click on a disabled row', Message.Clicked({ id: 'locked' })],
    ['focus on a disabled row', Message.Focused({ id: 'locked' })],
    ['focus on the current row', Message.Focused({ id: 'readme' })],
    ['a key the tree ignores', Message.Pressed({ key: 'Tab' })],
  ])('changes nothing on %s', (_, sent) => {
    const model = at([], Option.some('readme'))
    expect(update(model, sent).model).toBe(model)
  })
})

const style = Style.forSlots(TreeViewSlots)(Recipes.TreeView({}))
const drawn = (model: TreeView.Model) =>
  TreeView.view(
    { label: 'Files', model, nodes: FILES, onMessage: () => message('Clicked'), style },
    h,
  )
const items = (model: TreeView.Model) => Inert.byRole(drawn(model), 'treeitem')
const read = (model: TreeView.Model, key: string) =>
  items(model).map(item => [Inert.value(item, 'id'), Inert.value(item, key)])

describe('TreeView.view', () => {
  it('meets the tree pattern', () => {
    expect(A11y.validate(Patterns.TreeView, TreeViewSlots)).toEqual([])
  })

  it('draws every element in a Slot', () => {
    expect(Inert.unslotted(drawn(at(['src'], Option.none())))).toEqual([])
  })

  it('names the tree and gives each row its level, place and depth', () => {
    const tree = drawn(at(['src'], Option.none()))
    expect(Inert.value(Inert.byRole(tree, 'tree')[0], 'aria-label')).toBe('Files')
    expect(
      Inert.byRole(tree, 'treeitem').map(item => [
        Inert.value(item, 'id'),
        Inert.value(item, 'aria-level'),
        Inert.value(item, 'aria-posinset'),
        Inert.value(item, 'aria-setsize'),
        Inert.style(item)['--fk-tree-level'],
      ]),
    ).toEqual([
      ['files-item-src', '1', '1', '4', '1'],
      ['files-item-components', '2', '1', '2', '2'],
      ['files-item-button', '3', '1', '2', '3'],
      ['files-item-tree', '3', '2', '2', '3'],
      ['files-item-index', '2', '2', '2', '2'],
      ['files-item-locked', '1', '2', '4', '1'],
      ['files-item-readme', '1', '3', '4', '1'],
      ['files-item-package', '1', '4', '4', '1'],
    ])
  })

  it('says open or shut only of rows that hold rows, and keeps a shut group inert', () => {
    const model = at(['src'], Option.none())
    expect(read(model, 'aria-expanded').map(([, open]) => open)).toEqual([
      'true',
      'false',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ])
    const groups = Inert.byRole(drawn(model), 'group')
    expect(groups.map(group => Inert.value(group, 'inert'))).toEqual([undefined, ''])
  })

  it.each([
    ['the first row before any is current', Option.none(), 'src'],
    ['the current row', Option.some('readme'), 'readme'],
    ['the first row while the current one is hidden', Option.some('button'), 'src'],
  ] as const)('holds one tab stop, on %s', (_, current, stop) => {
    const stops = read(at([], current), 'tabIndex').filter(([, index]) => index === 0)
    expect(stops).toEqual([[`files-item-${stop}`, 0]])
  })

  it('marks the chosen row and the disabled one', () => {
    const model = { ...at([], Option.none()), selected: Option.some('readme') }
    expect(read(model, 'aria-selected').filter(([, chosen]) => chosen === 'true')).toEqual([
      ['files-item-readme', 'true'],
    ])
    expect(read(model, 'aria-disabled').filter(([, off]) => off === 'true')).toEqual([
      ['files-item-locked', 'true'],
    ])
  })
})
