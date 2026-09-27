/**
 * A Message that changes nothing returns the Model itself. Foldkit renders only
 * when the root Model changes identity, so an equal copy re-renders the page.
 */
import { describe, expect, it } from 'vitest'
import {
  Geolocation,
  GeolocationMessage,
  MediaDevicesMessage,
  MediaStreamMessage,
  mediaDevices,
  mediaStream,
  permissions,
  PermissionsMessage,
} from '../src/device/index.js'
import {
  Idle,
  IdleMessage,
  Visibility,
  VisibilityMessage,
  WindowSize,
  WindowSizeMessage,
} from '../src/events/index.js'
import {
  Online,
  OnlineMessage,
  sse,
  SseMessage,
  websocket,
  WebSocketMessage,
} from '../src/net/index.js'
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

const Socket = websocket({ name: 'Socket' })
const Events = sse({ name: 'Events' })
const Camera = mediaStream({ name: 'Camera' })
const Devices = mediaDevices({ name: 'Devices' })
const Permissions = permissions({ name: 'Permissions' })
const url = { url: 'ws://x' }
const open = { url: 'ws://x', status: 'open' as const, lastError: null }
const closed = { url: 'ws://x', status: 'closed' as const, lastError: 'gone' }
const retrying = { url: 'ws://x', status: 'connecting' as const, lastError: 'gone' }
const camera = { audio: true, video: true }
const microphone = { deviceId: 'm', groupId: 'g', kind: 'audioinput' as const, label: 'Mic' }
const granted = { states: { camera: 'granted' as const }, lastError: null }
const names = { names: ['camera'] }

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
    [
      'WebSocket Opened while open',
      keeps(open, m => Socket.update(m, WebSocketMessage.Opened(), url)),
    ],
    [
      'WebSocket Closed while closed',
      keeps(closed, m => Socket.update(m, WebSocketMessage.Closed(), url)),
    ],
    [
      'WebSocket SendFailed with the error held',
      keeps(closed, m => Socket.update(m, WebSocketMessage.SendFailed({ message: 'gone' }), url)),
    ],
    [
      'SSE Failed again on a retry',
      keeps(retrying, m => Events.update(m, SseMessage.Failed({ message: 'gone' }), url)),
    ],
    [
      'MediaStream Ended after Stopped',
      keeps({ status: 'idle' as const, lastError: null }, m =>
        Camera.update(m, MediaStreamMessage.Ended(), camera),
      ),
    ],
    [
      'MediaStream Started while live',
      keeps({ status: 'live' as const, lastError: null }, m =>
        Camera.update(m, MediaStreamMessage.Started(), camera),
      ),
    ],
    [
      'MediaDevices Refreshed with the same list',
      keeps({ status: 'ready' as const, devices: [microphone], lastError: null }, m =>
        Devices.update(
          m,
          MediaDevicesMessage.Refreshed({ devices: [{ ...microphone }] }),
          undefined,
        ),
      ),
    ],
    [
      'Permissions Changed to the state held',
      keeps(granted, m =>
        Permissions.update(
          m,
          PermissionsMessage.Changed({ name: 'camera', state: 'granted' }),
          names,
        ),
      ),
    ],
    [
      'Permissions Snapshot of the states held',
      keeps(granted, m =>
        Permissions.update(
          m,
          PermissionsMessage.Snapshot({ states: { camera: 'granted' } }),
          names,
        ),
      ),
    ],
    [
      'Permissions Cleared when empty',
      keeps({ states: {}, lastError: null }, m =>
        Permissions.update(m, PermissionsMessage.Cleared(), names),
      ),
    ],
    [
      'Geolocation Located at the fix held',
      keeps(
        {
          status: 'ready' as const,
          coords: { latitude: 1, longitude: 2, accuracy: 3 },
          lastError: null,
        },
        m =>
          Geolocation.update(
            m,
            GeolocationMessage.Located({ latitude: 1, longitude: 2, accuracy: 3 }),
            undefined,
          ),
      ),
    ],
    [
      'Visibility Changed to the state held',
      keeps({ visible: true }, m =>
        Visibility.update(m, VisibilityMessage.Changed({ visible: true }), undefined),
      ),
    ],
    [
      'Online Changed to the state held',
      keeps({ online: true }, m =>
        Online.update(m, OnlineMessage.Changed({ online: true }), undefined),
      ),
    ],
    [
      'WindowSize Changed to the size held',
      keeps({ width: 800, height: 600 }, m =>
        WindowSize.update(m, WindowSizeMessage.Changed({ width: 800, height: 600 }), undefined),
      ),
    ],
    [
      'Idle BecameIdle while idle',
      keeps({ idle: true }, m => Idle.update(m, IdleMessage.BecameIdle(), { timeoutMs: 10 })),
    ],
  ])('%s', (_, check) => check())
})

describe('a Message that changes something still does', () => {
  it('Permissions Snapshot that drops a state', () => {
    const two = {
      states: { camera: 'granted' as const, microphone: 'denied' as const },
      lastError: null,
    }
    const next = Permissions.update(
      two,
      PermissionsMessage.Snapshot({ states: { camera: 'granted' } }),
      names,
    )
    expect(next.model.states).toEqual({ camera: 'granted' })
  })
})

describe('socket subscriptions', () => {
  it.each([
    ['WebSocket', Socket.subscriptions!(url).incoming!],
    ['SSE', Events.subscriptions!(url).incoming!],
  ])('%s keeps its stream from connecting to open', (_, entry) => {
    const connecting = { url: 'ws://x', status: 'connecting' as const, lastError: null }
    expect(entry.modelToDependencies(open)).toEqual(entry.modelToDependencies(connecting))
    expect(entry.modelToDependencies(closed)).not.toEqual(entry.modelToDependencies(connecting))
  })
})
