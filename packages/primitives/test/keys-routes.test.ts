/**
 * The route each navigation primitive exports (`keys`), asked through
 * `Keys.answer` as `behavior` asks it: which presses it takes (Shift does not
 * change a navigation key, a modifier that does is left alone), what each
 * answers (focus moves unless `virtual`), that it composes in one router with
 * a route of the caller's, and that its declared chords are checked for
 * overlap against the caller's. Also `Typeahead.isPrintable` as `Keys.printable`.
 */
import { Option } from 'effect'
import type { KeyboardModifiers } from 'foldkit/html'
import { Bundle } from 'foldkit-bundle'
import { Behaviors } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import {
  GridNavigation,
  ListNavigation,
  RovingTabindex,
  TreeNavigation,
  Typeahead,
} from '../src/interaction/index.js'

const { Keys } = Behaviors

const plain: KeyboardModifiers = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }
const items = Behaviors.Collection.of(['apple', 'banana', 'cherry'], { id: fruit => fruit })

const List = Bundle.declare(ListNavigation.bundle, 'list')
const Roving = Bundle.declare(RovingTabindex.bundle, 'roving')
const Grid = Bundle.declare(GridNavigation.bundle, 'grid')
const Tree = Bundle.declare(TreeNavigation.bundle, 'tree')
const Type = Bundle.declare(Typeahead.bundle, 'type')

interface Input {
  readonly list: ListNavigation.Model
  readonly roving: RovingTabindex.Model
  readonly grid: GridNavigation.Model
  readonly tree: TreeNavigation.Model
  readonly type: Typeahead.Model
}
const input: Input = {
  list: { current: 'apple', query: '', generation: 0 },
  roving: { current: 'apple' },
  grid: { current: 'apple' },
  tree: { current: 'docs', toggled: [] },
  type: { query: '', generation: 0 },
}
const rows: ReadonlyArray<TreeNavigation.Row> = [
  { id: 'docs', parent: null, branch: false },
  { id: 'readme', parent: null, branch: false },
]

const listArgs = {
  orientation: 'vertical',
  loop: false,
  virtual: false,
  timeoutMs: 500,
  page: 2,
} as const
const rovingArgs = { orientation: 'vertical', loop: false, virtual: false } as const
const gridArgs = { columns: 3, wrap: false, virtual: false } as const
const treeArgs = { openByDefault: false } as const
const listOptions = {
  items: () => items,
  text: (_: Input, index: number) => items.ids[index] ?? '',
}

type Route = Behaviors.Keys.Route<Input, string>
const routes = {
  list: ListNavigation.keys(List, listArgs)<Input, string>(listOptions),
  listVirtual: ListNavigation.keys(List, { ...listArgs, virtual: true })<Input, string>(
    listOptions,
  ),
  listCommit: ListNavigation.keys(
    List,
    listArgs,
  )<Input, string>({
    ...listOptions,
    commit: (_input, id) => `commit ${id}`,
  }),
  roving: RovingTabindex.keys(Roving, rovingArgs)<Input, string>({ items: () => items }),
  rovingVirtual: RovingTabindex.keys(Roving, { ...rovingArgs, virtual: true })<Input, string>({
    items: () => items,
  }),
  grid: GridNavigation.keys(Grid, gridArgs)<Input, string>({ items: () => items }),
  tree: TreeNavigation.keys(Tree, treeArgs)<Input, string>({ rows: () => rows }),
  typeahead: Typeahead.keys(Type)<Input, string>({
    ...listOptions,
    current: () => 'apple',
  }),
} satisfies Record<string, Route>

const press = (route: Route, key: string, modifiers: Partial<KeyboardModifiers> = {}) =>
  Keys.answer([route])({ key, modifiers: { ...plain, ...modifiers }, input })

/** What the answer asks of the handler: focus an id, send a bare message, or nothing. */
const outcome = (answer: ReturnType<typeof press>): string =>
  Option.match(answer, {
    onNone: () => 'none',
    onSome: given => (typeof given === 'object' && 'id' in given ? `focus ${given.id}` : 'message'),
  })

describe('the presses a route takes', () => {
  it.each<[string, Route, string, Partial<KeyboardModifiers>, 'taken' | 'left']>([
    ['ListNavigation ArrowDown', routes.list, 'ArrowDown', {}, 'taken'],
    ['ListNavigation Shift+ArrowDown', routes.list, 'ArrowDown', { shiftKey: true }, 'taken'],
    ['ListNavigation Alt+ArrowDown', routes.list, 'ArrowDown', { altKey: true }, 'left'],
    ['ListNavigation PageDown', routes.list, 'PageDown', {}, 'taken'],
    ['ListNavigation ArrowRight, vertical', routes.list, 'ArrowRight', {}, 'left'],
    ['ListNavigation Enter without commit', routes.list, 'Enter', {}, 'left'],
    [
      'ListNavigation Shift+Enter with commit',
      routes.listCommit,
      'Enter',
      { shiftKey: true },
      'left',
    ],
    ['RovingTabindex Home', routes.roving, 'Home', {}, 'taken'],
    ['RovingTabindex Shift+End', routes.roving, 'End', { shiftKey: true }, 'taken'],
    ['RovingTabindex Ctrl+Home', routes.roving, 'Home', { ctrlKey: true }, 'left'],
    ['RovingTabindex PageDown, which it does not handle', routes.roving, 'PageDown', {}, 'left'],
    ['GridNavigation ArrowRight', routes.grid, 'ArrowRight', {}, 'taken'],
    ['GridNavigation Ctrl+End', routes.grid, 'End', { ctrlKey: true }, 'taken'],
    ['GridNavigation Ctrl+ArrowDown', routes.grid, 'ArrowDown', { ctrlKey: true }, 'left'],
    ['TreeNavigation ArrowDown', routes.tree, 'ArrowDown', {}, 'taken'],
    ['TreeNavigation Shift+ArrowUp', routes.tree, 'ArrowUp', { shiftKey: true }, 'taken'],
    ['TreeNavigation Meta+ArrowDown', routes.tree, 'ArrowDown', { metaKey: true }, 'left'],
  ])('%s', (_name, route, key, modifiers, expected) => {
    expect(Option.isSome(press(route, key, modifiers))).toBe(expected === 'taken')
  })
})

describe('what a route answers', () => {
  it('moves focus to the item, or sends the Message alone under virtual', () => {
    expect(outcome(press(routes.list, 'ArrowDown'))).toBe('focus banana')
    expect(outcome(press(routes.listVirtual, 'ArrowDown'))).toBe('message')
    expect(outcome(press(routes.roving, 'ArrowDown'))).toBe('focus banana')
    expect(outcome(press(routes.rovingVirtual, 'ArrowDown'))).toBe('message')
    expect(outcome(press(routes.grid, 'ArrowRight'))).toBe('focus banana')
    expect(outcome(press(routes.tree, 'ArrowDown'))).toBe('focus readme')
  })
  it('commits on Enter and types a printable key to its match', () => {
    expect(outcome(press(routes.listCommit, 'Enter'))).toBe('focus apple')
    expect(outcome(press(routes.list, 'c'))).toBe('focus cherry')
    expect(outcome(press(routes.typeahead, 'b'))).toBe('focus banana')
    expect(outcome(press(routes.typeahead, ' '))).toBe('none')
  })
  it('with no match and nothing current sends the typed key and moves no focus', () => {
    const nothing = { ...input, list: { current: null, query: '', generation: 0 } }
    const answer = Keys.answer([routes.list])({ key: 'z', modifiers: plain, input: nothing })
    expect(outcome(answer)).toBe('message')
  })
})

describe('one router with a route of the caller', () => {
  const clears = Keys.route<Input, string>('EscapeClears', {
    on: [Keys.chord('Escape')],
    handle: () => Option.some('cleared'),
  })

  it('takes Escape from the caller and ArrowDown from the primitive', () => {
    const answer = Keys.answer([clears, routes.list])
    const asked = (key: string) => answer({ key, modifiers: plain, input })
    expect(Option.getOrThrow(asked('Escape'))).toBe('cleared')
    expect(outcome(asked('ArrowDown'))).toBe('focus banana')
  })

  it('refuses a caller chord that a primitive route also declares', () => {
    const arrow = Keys.route<Input, string>('Mine', {
      on: [Keys.chord('ArrowDown')],
      handle: () => Option.some('mine'),
    })
    expect(() => Keys.answer([arrow, routes.list])).toThrow(/ArrowDown/)
  })

  it('declares every printable key only while typeahead is on', () => {
    const slash = Keys.route<Input, string>('Slash', {
      on: [Keys.chord('/')],
      handle: () => Option.some('slash'),
    })
    expect(() => Keys.answer([slash, routes.list])).toThrow(/"\/"/)
    const off = ListNavigation.keys(
      List,
      listArgs,
    )<Input, string>({
      ...listOptions,
      typeahead: false,
    })
    expect(() => Keys.answer([slash, off])).not.toThrow()
  })
})

describe('Typeahead.isPrintable', () => {
  it.each<[string, string, Partial<KeyboardModifiers>, boolean]>([
    ['a letter', 'a', {}, true],
    ['a shifted letter', 'A', { shiftKey: true }, true],
    ['a character outside the BMP, two UTF-16 units', '\u{1F600}', {}, true],
    ['a named key', 'Enter', {}, false],
    ['two characters', 'ab', {}, false],
    ['a chord with ctrl', 'a', { ctrlKey: true }, false],
    ['a chord with alt', 'a', { altKey: true }, false],
    ['a chord with meta', 'a', { metaKey: true }, false],
  ])('%s', (_name, key, modifiers, expected) => {
    expect(Typeahead.isPrintable(key, { ...plain, ...modifiers })).toBe(expected)
  })
})
