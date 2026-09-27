/**
 * A Message that changes nothing returns the Model itself. Foldkit renders only
 * when the root Model changes identity, so an equal copy re-renders the page.
 */
import { describe, expect, it } from 'vitest'
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
  ])('%s', (_, check) => check())
})
