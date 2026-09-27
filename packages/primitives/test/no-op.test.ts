/**
 * A Message that changes nothing returns the Model itself. Foldkit renders only
 * when the root Model changes identity, so an equal copy re-renders the page.
 */
import { describe, expect, it } from 'vitest'
import {
  DismissLayer,
  GridNavigation,
  ListNavigation,
  RovingTabindex,
  Selection,
  TreeNavigation,
  Typeahead,
} from '../src/interaction/index.js'
import {
  Breakpoints,
  BreakpointsMessage,
  MediaQuery,
  MediaQueryMessage,
} from '../src/media/index.js'
import {
  Presence,
  PresenceMessage,
  Spring,
  SpringMessage,
  Tween,
  TweenMessage,
} from '../src/motion/index.js'
import {
  History,
  Locale,
  LocaleMessage,
  Pagination,
  PaginationMessage,
  SelectionSet,
  SelectionSetMessage,
  Virtual,
  VirtualMessage,
} from '../src/state/index.js'
import { Interval, IntervalMessage, Timer, TimerMessage } from '../src/time/index.js'

const keeps =
  <Model>(model: Model, run: (model: Model) => { readonly model: unknown }) =>
  () =>
    expect(run(model).model).toBe(model)

const page = { page: 1, perPage: 10, total: 95 }
const lastPage = { ...page, page: 10 }
const timer = { intervalMs: 10 }
const tween = { from: 0, to: 1, ms: 100 }
const spring = { from: 0, to: 1, stiffness: 100, damping: 10 }
const selected = { selected: ['a', 'b'] }

const list = {
  scrollTop: 40,
  heights: { a: 10 },
  scrolling: false,
  generation: 0,
  estimatedHeight: 10,
  overscan: 0,
  gap: 0,
  paddingStart: 0,
  paddingEnd: 0,
}

const listNav = {
  orientation: 'vertical' as const,
  loop: false,
  virtual: false,
  timeoutMs: 500,
  page: 5,
}
const picked = { selected: ['b', 'c'], anchor: 'b' }
const multiple = { mode: 'multiple' as const, allowEmpty: true }
const layers = [{ id: 'menu', outside: true, escape: true }]

describe('a Message that changes nothing keeps the Model', () => {
  it.each([
    [
      'Pagination GoToPage to the current page',
      keeps(page, m =>
        Pagination.update(m, PaginationMessage.GoToPage({ page: 1 }), { perPage: 10 }),
      ),
    ],
    [
      'Pagination PrevPage on page 1',
      keeps(page, m => Pagination.update(m, PaginationMessage.PrevPage(), { perPage: 10 })),
    ],
    [
      'Pagination NextPage on the last page',
      keeps(lastPage, m => Pagination.update(m, PaginationMessage.NextPage(), { perPage: 10 })),
    ],
    [
      'Pagination SetPerPage to the same size',
      keeps(page, m =>
        Pagination.update(m, PaginationMessage.SetPerPage({ perPage: 10 }), { perPage: 10 }),
      ),
    ],
    [
      'Pagination SetTotal to the same total',
      keeps(page, m =>
        Pagination.update(m, PaginationMessage.SetTotal({ total: 95 }), { perPage: 10 }),
      ),
    ],
    [
      'SelectionSet Deselect of an unselected id',
      keeps(selected, m =>
        SelectionSet.update(m, SelectionSetMessage.Deselect({ id: 'c' }), undefined),
      ),
    ],
    [
      'SelectionSet ReplaceAll with the same ids',
      keeps(selected, m =>
        SelectionSet.update(m, SelectionSetMessage.ReplaceAll({ ids: ['a', 'b', 'a'] }), undefined),
      ),
    ],
    [
      'SelectionSet Clear when empty',
      keeps({ selected: [] }, m => SelectionSet.update(m, SelectionSetMessage.Clear(), undefined)),
    ],
    [
      'Locale SetLocale to the current locale',
      keeps({ locale: 'en' }, m =>
        Locale.update(m, LocaleMessage.SetLocale({ locale: 'en' }), { default: 'en' }),
      ),
    ],
    [
      'History clear with nothing to clear',
      keeps(History.start(1), m => ({ model: History.clear(m) })),
    ],
    [
      'Timer Started while running',
      keeps({ count: 0, running: true }, m => Timer.update(m, TimerMessage.Started(), timer)),
    ],
    [
      'Timer Stopped while stopped',
      keeps({ count: 0, running: false }, m => Timer.update(m, TimerMessage.Stopped(), timer)),
    ],
    [
      'Interval Started while running',
      keeps({ running: true, lastAt: null }, m =>
        Interval.update(m, IntervalMessage.Started(), timer),
      ),
    ],
    [
      'Interval Stopped while stopped',
      keeps({ running: false, lastAt: null }, m =>
        Interval.update(m, IntervalMessage.Stopped(), timer),
      ),
    ],
    [
      'Tween Started while running',
      keeps({ value: 0, running: true }, m => Tween.update(m, TweenMessage.Started(), tween)),
    ],
    [
      'Tween Stopped while stopped',
      keeps({ value: 0, running: false }, m => Tween.update(m, TweenMessage.Stopped(), tween)),
    ],
    [
      'Tween Ticked on the value held',
      keeps({ value: 0, running: true }, m =>
        Tween.update(m, TweenMessage.Ticked({ value: 0 }), tween),
      ),
    ],
    [
      'Spring Started while running',
      keeps({ value: 0, velocity: 0, running: true }, m =>
        Spring.update(m, SpringMessage.Started(), spring),
      ),
    ],
    [
      'Spring Stopped while stopped',
      keeps({ value: 0, velocity: 0, running: false }, m =>
        Spring.update(m, SpringMessage.Stopped(), spring),
      ),
    ],
    [
      'Presence Show while shown',
      keeps({ phase: 'shown' as const, generation: 1 }, m =>
        Presence.update(m, PresenceMessage.Show(), { durationMs: 10 }),
      ),
    ],
    [
      'Presence Hide while hidden',
      keeps({ phase: 'hidden' as const, generation: 1 }, m =>
        Presence.update(m, PresenceMessage.Hide(), { durationMs: 10 }),
      ),
    ],
    [
      'MediaQuery Changed to the value held',
      keeps({ matches: false }, m =>
        MediaQuery.update(m, MediaQueryMessage.Changed({ matches: false }), { query: 'x' }),
      ),
    ],
    [
      'Breakpoints Changed to the same width',
      keeps({ width: 800, breakpoint: 'md' }, m =>
        Breakpoints.update(m, BreakpointsMessage.Changed({ width: 800 }), {
          breakpoints: { md: 768 },
        }),
      ),
    ],
    [
      'Virtual Scrolled to the top held',
      keeps(list, m => Virtual.update(m, VirtualMessage.Scrolled({ top: 40 }), list)),
    ],
    [
      'Virtual Measured at the height held',
      keeps(list, m => Virtual.update(m, VirtualMessage.Measured({ key: 'a', height: 10 }), list)),
    ],
    [
      'Virtual Prune that drops nothing',
      keeps(list, m => Virtual.update(m, VirtualMessage.Prune({ keys: ['a', 'b'] }), list)),
    ],
    [
      'RovingTabindex Focused on the current item',
      keeps({ current: 'a' }, m =>
        RovingTabindex.bundle.update(m, RovingTabindex.Message.Focused({ id: 'a' }), {
          orientation: 'horizontal',
          loop: false,
          virtual: false,
        }),
      ),
    ],
    [
      'GridNavigation Focused on the current cell',
      keeps({ current: 'a' }, m =>
        GridNavigation.bundle.update(m, GridNavigation.Message.Focused({ id: 'a' }), {
          columns: 2,
          wrap: false,
          virtual: false,
        }),
      ),
    ],
    [
      'TreeNavigation Focused on the current row',
      keeps({ current: 'a', toggled: [] }, m =>
        TreeNavigation.bundle.update(m, TreeNavigation.Message.Focused({ id: 'a' }), {
          openByDefault: false,
        }),
      ),
    ],
    [
      'ListNavigation Focused on the current item',
      keeps({ current: 'a', query: '', generation: 0 }, m =>
        ListNavigation.bundle.update(m, ListNavigation.Message.Focused({ id: 'a' }), listNav),
      ),
    ],
    [
      'ListNavigation Cleared with no query',
      keeps({ current: 'a', query: '', generation: 0 }, m =>
        ListNavigation.bundle.update(m, ListNavigation.Message.Cleared(), listNav),
      ),
    ],
    [
      'Typeahead Cleared with no query',
      keeps({ query: '', generation: 3 }, m =>
        Typeahead.bundle.update(m, Typeahead.Message.Cleared(), { timeoutMs: 500 }),
      ),
    ],
    [
      'Typeahead Expired with no query',
      keeps({ query: '', generation: 3 }, m =>
        Typeahead.bundle.update(m, Typeahead.Message.Expired({ generation: 3 }), {
          timeoutMs: 500,
        }),
      ),
    ],
    [
      'Selection Ranged over what is selected already',
      keeps(picked, m =>
        Selection.bundle.update(
          m,
          Selection.Message.Ranged({ id: 'c', order: ['a', 'b', 'c', 'd'] }),
          multiple,
        ),
      ),
    ],
    [
      'Selection Replaced with the same ids',
      keeps(picked, m =>
        Selection.bundle.update(m, Selection.Message.Replaced({ ids: ['b', 'c'] }), multiple),
      ),
    ],
    [
      'Selection Cleared when empty',
      keeps({ selected: [], anchor: 'b' }, m =>
        Selection.bundle.update(m, Selection.Message.Cleared(), multiple),
      ),
    ],
    [
      'DismissLayer PressedAt with the layers held',
      keeps({ layers }, m =>
        DismissLayer.bundle.update(
          m,
          DismissLayer.Message.PressedAt({
            layers: [{ id: 'menu', outside: true, escape: true }],
            inside: ['menu'],
          }),
          undefined,
        ),
      ),
    ],
    [
      'DismissLayer PressedEscape with the layers held',
      keeps({ layers }, m =>
        DismissLayer.bundle.update(
          m,
          DismissLayer.Message.PressedEscape({
            layers: [{ id: 'menu', outside: true, escape: true }],
          }),
          undefined,
        ),
      ),
    ],
  ])('%s', (_, check) => check())
})
