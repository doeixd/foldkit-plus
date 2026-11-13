/**
 * Each primitive's child update capabilities (#495): a helper gives what its
 * `update` gives for the Message it stands for, so a parent never builds the
 * child's Messages; and `toggle` decides open or shut from the tree's state.
 */
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import {
  GridNavigation,
  ListNavigation,
  LiveAnnounce,
  RovingTabindex,
  Selection,
  TreeNavigation,
  Typeahead,
} from '../src/interaction/index.js'

/** What a step is, Commands by name and args: their Effects are new objects per call. */
const shape = (result: {
  readonly model: unknown
  readonly commands?: ReadonlyArray<{ readonly name: string; readonly args?: unknown }>
}) => ({
  model: result.model,
  commands: (result.commands ?? []).map(({ name, args }) => ({ name, args })),
})

const selectionArgs = { mode: 'multiple', allowEmpty: true } as const
const selection = { selected: ['a'], anchor: 'a', ranged: [] }
const treeArgs = { openByDefault: false }
const tree = { current: null, toggled: ['open'] }
const listArgs = {
  orientation: 'vertical',
  loop: false,
  virtual: false,
  timeoutMs: 500,
  page: 10,
} as const
const gridArgs = { columns: 3, wrap: false, virtual: false }
const announceArgs = { debounceMs: 50, clearAfterMs: 1000 }
const announcer = { polite: '', assertive: '', pending: null, generation: 3 }

describe('a capability gives what its Message gives through update', () => {
  it.each([
    [
      'Selection.activate',
      Bundle.helpersOf(Selection.bundle, selectionArgs).activate(selection, 'b'),
      Selection.bundle.update(selection, Selection.Message.Activated({ id: 'b' }), selectionArgs),
    ],
    [
      'Selection.replace',
      Bundle.helpersOf(Selection.bundle, selectionArgs).replace(selection, ['c', 'd']),
      Selection.bundle.update(
        selection,
        Selection.Message.Replaced({ ids: ['c', 'd'] }),
        selectionArgs,
      ),
    ],
    [
      'Selection.clear',
      Bundle.helpersOf(Selection.bundle, selectionArgs).clear(selection),
      Selection.bundle.update(selection, Selection.Message.Cleared(), selectionArgs),
    ],
    [
      'TreeNavigation.focus',
      Bundle.helpersOf(TreeNavigation.bundle, treeArgs).focus(tree, 'row'),
      TreeNavigation.bundle.update(tree, TreeNavigation.Message.Focused({ id: 'row' }), treeArgs),
    ],
    [
      'TreeNavigation.open',
      Bundle.helpersOf(TreeNavigation.bundle, treeArgs).open(tree, 'shut'),
      TreeNavigation.bundle.update(tree, TreeNavigation.Message.Opened({ id: 'shut' }), treeArgs),
    ],
    [
      'TreeNavigation.close',
      Bundle.helpersOf(TreeNavigation.bundle, treeArgs).close(tree, 'open'),
      TreeNavigation.bundle.update(tree, TreeNavigation.Message.Closed({ id: 'open' }), treeArgs),
    ],
    [
      'RovingTabindex.focus',
      Bundle.helpersOf(RovingTabindex.bundle, {
        orientation: 'horizontal',
        loop: true,
        virtual: false,
      }).focus({ current: null }, 'x'),
      RovingTabindex.bundle.update({ current: null }, RovingTabindex.Message.Focused({ id: 'x' }), {
        orientation: 'horizontal',
        loop: true,
        virtual: false,
      }),
    ],
    [
      'GridNavigation.focus',
      Bundle.helpersOf(GridNavigation.bundle, gridArgs).focus({ current: null }, 'x'),
      GridNavigation.bundle.update(
        { current: null },
        GridNavigation.Message.Focused({ id: 'x' }),
        gridArgs,
      ),
    ],
    [
      'ListNavigation.focus',
      Bundle.helpersOf(ListNavigation.bundle, listArgs).focus(
        { current: null, query: 'ab', generation: 2 },
        'x',
      ),
      ListNavigation.bundle.update(
        { current: null, query: 'ab', generation: 2 },
        ListNavigation.Message.Focused({ id: 'x' }),
        listArgs,
      ),
    ],
    [
      'Typeahead.clear',
      Bundle.helpersOf(Typeahead.bundle, { timeoutMs: 500 }).clear({ query: 'ab', generation: 2 }),
      Typeahead.bundle.update({ query: 'ab', generation: 2 }, Typeahead.Message.Cleared(), {
        timeoutMs: 500,
      }),
    ],
    [
      'LiveAnnounce.announce, politely by default',
      Bundle.helpersOf(LiveAnnounce.bundle, announceArgs).announce(announcer, 'Saved'),
      LiveAnnounce.bundle.update(
        announcer,
        LiveAnnounce.Message.Announced({ message: 'Saved', politeness: 'polite' }),
        announceArgs,
      ),
    ],
    [
      'LiveAnnounce.announce, assertively when asked',
      Bundle.helpersOf(LiveAnnounce.bundle, announceArgs).announce(
        announcer,
        'Failed',
        'assertive',
      ),
      LiveAnnounce.bundle.update(
        announcer,
        LiveAnnounce.Message.Announced({ message: 'Failed', politeness: 'assertive' }),
        announceArgs,
      ),
    ],
  ])('%s', (_, capability, message) => {
    expect(shape(capability)).toEqual(shape(message))
  })
})

describe('TreeNavigation.toggle', () => {
  const toggle = Bundle.helpersOf(TreeNavigation.bundle, treeArgs).toggle
  it('opens a shut row and shuts an open one', () => {
    expect(TreeNavigation.isOpen(toggle(tree, 'shut').model, treeArgs, 'shut')).toBe(true)
    expect(TreeNavigation.isOpen(toggle(tree, 'open').model, treeArgs, 'open')).toBe(false)
  })

  it('reads the default from the placement’s args', () => {
    const openByDefault = { openByDefault: true }
    const flipped = Bundle.helpersOf(TreeNavigation.bundle, openByDefault).toggle(tree, 'shut')
    // Open by default, an untoggled row is open, so a toggle shuts it.
    expect(TreeNavigation.isOpen(flipped.model, openByDefault, 'shut')).toBe(false)
  })
})
