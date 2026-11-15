/**
 * TreeView as a transition and as markup: the keys move over the rows
 * showing, stepping over shut and disabled ones, open and shut a row or
 * step in and out, a character moves to the next showing row it starts,
 * Enter and a click choose, and the drawn tree carries each row's place,
 * depth and state with one tab stop; a checkable tree checks a row and every
 * enabled row beneath it, and reads a row holding rows as checked, mixed or
 * not from them.
 */
import { Option } from 'effect'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { A11y, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Patterns, Recipes, TreeView, TreeViewSlots } from '../src/index.js'
import { h, message, type TestMessage } from './fixture.js'

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
  ] as const)('%s, and focuses it', (_, open, current, key, to) => {
    const result = press(at(open, Option.fromUndefinedOr(current)), key)
    expect(result.model.current).toEqual(Option.some(to))
    expect(names(result)).toEqual(['FocusItem'])
  })

  it.each([
    ['a character moves to the next row it starts', [], 'src', 'r', 'readme'],
    ['a character finds an open row’s rows', ['src', 'components'], 'button', 't', 'tree'],
  ] as const)('%s, focuses it and starts the query’s expiry', (_, open, current, key, to) => {
    const result = press(at(open, Option.fromUndefinedOr(current)), key)
    expect(result.model.current).toEqual(Option.some(to))
    expect(names(result)).toEqual(['FocusItem', 'ExpireQuery'])
  })

  it('a character skips the rows of a shut row, keeping the query', () => {
    const model = at([], Option.some('src'))
    const result = press(model, 'b')
    expect(result.model.current).toEqual(model.current)
    expect(result.model.typeahead.query).toBe('b')
    expect(names(result)).toEqual(['ExpireQuery'])
  })

  it('typed letters add up to a word, which stays on the row it matches', () => {
    const open = ['src', 'components']
    const first = press(at(open, Option.some('src')), 't')
    expect(first.model.current).toEqual(Option.some('tree'))
    // A lone `r` would go on to README.md; after `t` it asks for `tr`.
    const second = press(first.model, 'r')
    expect(second.model.current).toEqual(Option.some('tree'))
    expect(second.model.typeahead.query).toBe('tr')
  })

  it('a pause drops the query, once, for the key it followed', () => {
    const typed = press(at([], Option.some('src')), 'r').model
    const stale = update(
      typed,
      Message.QueryExpired({ generation: typed.typeahead.generation - 1 }),
    )
    expect(stale.model).toBe(typed)
    const expired = update(typed, Message.QueryExpired({ generation: typed.typeahead.generation }))
    expect(expired.model.typeahead.query).toBe('')
    expect(
      update(expired.model, Message.QueryExpired({ generation: typed.typeahead.generation })).model,
    ).toBe(expired.model)
  })

  it('a move ends the word being typed', () => {
    const typed = press(at([], Option.some('src')), 'r').model
    expect(press(typed, 'ArrowDown').model.typeahead.query).toBe('')
  })

  describe('`*`', () => {
    const nodes: ReadonlyArray<TreeView.TreeNode> = [
      { id: 'a', label: 'a', children: [{ id: 'a1', label: 'a1' }] },
      { id: 'b', label: 'b', children: [{ id: 'b1', label: 'b1' }] },
      { id: 'c', label: 'c' },
      { id: 'd', label: 'd', disabled: true, children: [{ id: 'd1', label: 'd1' }] },
      { id: 'e', label: 'e', children: [{ id: 'e1', label: 'e1' }] },
      {
        id: 'f',
        label: 'f',
        children: [{ id: 'g', label: 'g', children: [{ id: 'g1', label: 'g1' }] }],
      },
    ]
    const star = TreeView.update(nodes)
    const from = (open: ReadonlyArray<string>) => ({
      ...init({ id: 'files', open }),
      current: Option.some('a'),
    })

    it('opens every enabled row beside the current one that holds rows', () => {
      const result = star(from([]), Message.Pressed({ key: '*' }))
      // `g` is a row holding rows too, but beside `f`'s rows, not the current one's.
      expect([...result.model.open].sort()).toEqual(['a', 'b', 'e', 'f'])
      expect(result.commands ?? []).toEqual([])
    })

    it('changes nothing when they are all open, or nothing is current', () => {
      const open = from(['a', 'b', 'e', 'f'])
      expect(star(open, Message.Pressed({ key: '*' })).model).toBe(open)
      const none = init({ id: 'files' })
      expect(star(none, Message.Pressed({ key: '*' })).model).toBe(none)
    })
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
// Drawn through `Inert.draw`, which alone marks the Slots that `unslotted` reads.
const Drawn = SlotView.forMessages<TestMessage>().define(
  TreeViewSlots,
  (model: TreeView.Model, _, h) =>
    TreeView.view(
      { label: 'Files', model, nodes: FILES, onMessage: () => message('Clicked'), style },
      h,
    ),
)
const drawn = (model: TreeView.Model) => Inert.draw(Drawn, model)
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

  it.each([
    ['ltr', 'ArrowRight', 'true'],
    ['ltr', 'ArrowLeft', 'false'],
    ['rtl', 'ArrowLeft', 'true'],
    ['rtl', 'ArrowRight', 'false'],
  ] as const)('%s, %s on a shut row leaves it expanded %s', (direction, key, expanded) => {
    Scene.scene<TreeView.Model, TreeView.Message>(
      {
        update,
        view: (model, h) =>
          TreeView.view(
            { label: 'Files', model, nodes: FILES, onMessage: sent => sent, direction },
            h,
          ),
      },
      Scene.given(at([], Option.some('src'))),
      Scene.keydown(Scene.role('tree'), key),
      Scene.expect(Scene.selector('#files-item-src')).toHaveAttr('aria-expanded', expanded),
    )
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

// A second leaf under `components`' sibling, so a group holds a disabled row and two that agree
// up to a point: a check that took every row, or only the first, would read wrong.
const CHECKED: ReadonlyArray<TreeView.TreeNode> = [
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
      { id: 'lock', label: 'lock.ts', disabled: true },
    ],
  },
  { id: 'readme', label: 'README.md' },
]

describe('TreeView checks', () => {
  const update = TreeView.update(CHECKED, { checkable: true })
  const checked = (on: ReadonlyArray<string>, current?: string): TreeView.Model => ({
    ...init({ id: 'files', checked: on }),
    current: Option.fromUndefinedOr(current),
  })
  const sorted = (model: TreeView.Model) => [...model.checked].sort()

  it('reads a row holding rows from the rows beneath it', () => {
    const checks = TreeView.checksOf(CHECKED, ['button', 'tree'])
    expect(Object.fromEntries(checks)).toEqual({
      src: 'mixed',
      components: true,
      button: true,
      tree: true,
      index: false,
      lock: false,
      readme: false,
    })
    expect(TreeView.checksOf(CHECKED, []).get('src')).toBe(false)
  })

  it('checking a row checks every enabled row beneath it, and the disabled one keeps its state', () => {
    const on = update(checked([]), Message.Checked({ id: 'src' })).model
    expect(sorted(on)).toEqual(['button', 'index', 'tree'])
    // Every enabled row is checked, but the disabled one is not: it reads mixed, and pressing
    // it again unchecks what it can.
    expect(TreeView.checksOf(CHECKED, on.checked).get('src')).toBe('mixed')
    expect(update(on, Message.Checked({ id: 'src' })).model.checked).toEqual([])
    const locked = update(checked(['lock']), Message.Checked({ id: 'src' })).model
    expect(sorted(locked)).toEqual(['button', 'index', 'lock', 'tree'])
    expect(update(locked, Message.Checked({ id: 'src' })).model.checked).toEqual(['lock'])
  })

  it('a mixed row checks, as a mixed checkbox does', () => {
    const model = update(checked(['button']), Message.Checked({ id: 'components' })).model
    expect(sorted(model)).toEqual(['button', 'tree'])
  })

  it('a leaf checks and unchecks alone', () => {
    const on = update(checked(['button']), Message.Checked({ id: 'tree' })).model
    expect(sorted(on)).toEqual(['button', 'tree'])
    expect(update(on, Message.Checked({ id: 'button' })).model.checked).toEqual(['tree'])
  })

  it('Space checks the current row, and Enter still chooses it', () => {
    const spaced = update(checked([], 'components'), Message.Pressed({ key: ' ' })).model
    expect(sorted(spaced)).toEqual(['button', 'tree'])
    expect(spaced.selected).toEqual(Option.none())
    const entered = update(checked([], 'components'), Message.Pressed({ key: 'Enter' })).model
    expect(entered.checked).toEqual([])
    expect(entered.selected).toEqual(Option.some('components'))
  })

  it('Space in a tree that is not checkable chooses, as before', () => {
    const model = TreeView.update(CHECKED)(
      checked([], 'readme'),
      Message.Pressed({ key: ' ' }),
    ).model
    expect(model.checked).toEqual([])
    expect(model.selected).toEqual(Option.some('readme'))
  })

  it.each([
    ['a disabled row', Message.Checked({ id: 'lock' })],
    ['a row not in the tree', Message.Checked({ id: 'gone' })],
  ])('changes nothing on checking %s', (_, sent) => {
    const model = checked(['button'])
    expect(update(model, sent).model).toBe(model)
  })

  it('changes nothing on Space with no current row', () => {
    const model = checked([])
    expect(update(model, Message.Pressed({ key: ' ' })).model).toBe(model)
  })

  const CheckedTree = SlotView.forMessages<TestMessage>().define(
    TreeViewSlots,
    (model: TreeView.Model, _, h) =>
      TreeView.view(
        {
          label: 'Files',
          model,
          nodes: CHECKED,
          onMessage: () => message('Clicked'),
          checkable: true,
          style,
        },
        h,
      ),
  )
  const drawnChecked = (model: TreeView.Model) => Inert.draw(CheckedTree, model)

  it('draws each row checked, mixed or not, on its item and its box', () => {
    const tree = drawnChecked({ ...checked(['button']), open: ['src', 'components'] })
    expect(Inert.unslotted(tree)).toEqual([])
    const rows = Inert.byRole(tree, 'treeitem')
    expect(rows.map(row => Inert.value(row, 'aria-checked'))).toEqual([
      'mixed',
      'mixed',
      'true',
      'false',
      'false',
      'false',
      'false',
    ])
    expect(Inert.bySlot(tree, 'checkbox').map(box => Inert.value(box, 'data-state'))).toEqual([
      'mixed',
      'mixed',
      'checked',
      'unchecked',
      'unchecked',
      'unchecked',
      'unchecked',
    ])
  })

  it('draws no box and no aria-checked unless checkable', () => {
    const rows = Inert.byRole(drawn(at([], Option.none())), 'treeitem')
    expect(rows.map(row => Inert.value(row, 'aria-checked'))).toEqual(rows.map(() => undefined))
  })
})

describe('TreeView icons', () => {
  const ICONS: ReadonlyArray<TreeView.TreeNode> = [
    {
      id: 'src',
      label: 'src',
      icon: h.span([], ['shut']),
      openIcon: h.span([], ['open']),
      children: [{ id: 'index', label: 'index.ts', icon: h.span([], ['file']) }],
    },
    { id: 'plain', label: 'plain' },
  ]
  const Icons = SlotView.forMessages<TestMessage>().define(
    TreeViewSlots,
    (model: TreeView.Model, _, h) =>
      TreeView.view(
        { label: 'Files', model, nodes: ICONS, onMessage: () => message('Clicked'), style },
        h,
      ),
  )
  const texts = (open: ReadonlyArray<string>) =>
    Inert.byRole(Inert.draw(Icons, init({ id: 'files', open })), 'treeitem').map(row =>
      Inert.text(row),
    )

  it('draws a row its icon before its label, and its open icon while open', () => {
    expect(texts([])).toEqual(['shutsrcfileindex.ts', 'fileindex.ts', 'plain'])
    expect(texts(['src'])).toEqual(['opensrcfileindex.ts', 'fileindex.ts', 'plain'])
    expect(
      Inert.unslotted(Inert.draw(Icons, init({ id: 'files', open: ['src'] })), {
        inside: ['icon'],
      }),
    ).toEqual([])
  })
})

describe('TreeView checked values', () => {
  // src > components > button, tree; src > index, lock (disabled); readme.
  const table: ReadonlyArray<
    readonly [
      string,
      ReadonlyArray<string>,
      { readonly branch: ReadonlyArray<string>; readonly trunk: ReadonlyArray<string> },
    ]
  > = [
    ['nothing', [], { branch: [], trunk: [] }],
    [
      'one folder of the two',
      ['button', 'tree'],
      { branch: ['components', 'button', 'tree'], trunk: ['components'] },
    ],
    [
      'a folder and a loose file',
      ['button', 'tree', 'readme'],
      { branch: ['components', 'button', 'tree', 'readme'], trunk: ['components', 'readme'] },
    ],
    [
      'a folder missing its disabled file',
      ['button', 'tree', 'index'],
      { branch: ['components', 'button', 'tree', 'index'], trunk: ['components', 'index'] },
    ],
    [
      'everything, the disabled file too',
      ['button', 'tree', 'index', 'lock', 'readme'],
      {
        branch: ['src', 'components', 'button', 'tree', 'index', 'lock', 'readme'],
        trunk: ['src', 'readme'],
      },
    ],
  ]

  it.each(table)('%s, as each value', (_name, leaves, expected) => {
    expect(TreeView.checkedAs(CHECKED, leaves, 'leaf')).toEqual(
      ['button', 'tree', 'index', 'lock', 'readme'].filter(id => leaves.includes(id)),
    )
    expect(TreeView.checkedAs(CHECKED, leaves, 'branch')).toEqual(expected.branch)
    expect(TreeView.checkedAs(CHECKED, leaves, 'trunk')).toEqual(expected.trunk)
  })

  it.each(table)('%s, round trips through every value', (_name, leaves) => {
    for (const as of ['leaf', 'branch', 'trunk'] as const) {
      expect(TreeView.leavesOf(CHECKED, TreeView.checkedAs(CHECKED, leaves, as))).toEqual(
        ['button', 'tree', 'index', 'lock', 'readme'].filter(id => leaves.includes(id)),
      )
    }
  })

  it('leaves out ids the tree does not hold, and expands a branch id to the rows under it', () => {
    expect(TreeView.checkedAs(CHECKED, ['ghost', 'readme'], 'leaf')).toEqual(['readme'])
    expect(TreeView.checkedAs(CHECKED, ['src', 'readme'], 'leaf')).toEqual(['readme'])
    expect(TreeView.leavesOf(CHECKED, ['ghost', 'src', 'components'])).toEqual([
      'button',
      'tree',
      'index',
      'lock',
    ])
    expect(TreeView.leavesOf(CHECKED, [])).toEqual([])
  })

  it('a trunk value seeds a Model that reads and checks as one', () => {
    const model = init({ id: 'files', checked: TreeView.leavesOf(CHECKED, ['components']) })
    expect(TreeView.checksOf(CHECKED, model.checked).get('components')).toBe(true)
    expect(TreeView.checkedAs(CHECKED, model.checked, 'trunk')).toEqual(['components'])
  })
})
