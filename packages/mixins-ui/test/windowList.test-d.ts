/**
 * WindowList's view: `Item` is inferred from `items` and reaches `itemToKey`
 * and `itemToView`; `onMessage` maps the list's Messages into the
 * application's and is not where `Outer` is inferred. `resolveTrack` builds
 * a Scene's resolution through the same mapping. Type-checked, not executed.
 */
import type { Scene } from 'foldkit/test'
import { WindowList } from '../src/index.js'
import { h, message, type TestMessage } from './fixture.js'

const model = WindowList.init({ id: 'results', estimatedHeight: 40 })
const names = ['a.com', 'b.dev']

export const drawn = WindowList.view(
  {
    model,
    items: names,
    itemToKey: name => name,
    itemToView: (name, index) => h.span([], [`${index + 1}. ${name.toUpperCase()}`]),
    onMessage: () => message('Other'),
  },
  h,
)

export const keyedByNumber = WindowList.view(
  {
    model,
    items: names,
    // @ts-expect-error A row's key is a string.
    itemToKey: (_, index) => index,
    itemToView: name => h.span([], [name]),
    onMessage: () => message('Other'),
  },
  h,
)

export const wrongItem = WindowList.view(
  {
    model,
    items: names,
    itemToKey: name => name,
    // @ts-expect-error Item is inferred from `items`: a string has no `toFixed`.
    itemToView: name => h.span([], [name.toFixed(0)]),
    onMessage: () => message('Other'),
  },
  h,
)

export const foreignMessage = WindowList.view(
  {
    model,
    items: names,
    itemToKey: name => name,
    itemToView: name => h.span([], [name]),
    // @ts-expect-error The list's Messages map into the builder's, not into another type.
    onMessage: () => 'Clicked',
  },
  h,
)

// @ts-expect-error A Placed reading carries both its top and its height.
export const halfPlaced = WindowList.Message.Placed({ top: 0 })

const placed = WindowList.Message.Placed({ top: 0, height: 900 })

// A Scene resolves the list's Mount with the page's Message, built by the view's `onMessage`.
export const resolved: Scene.MountResolver<TestMessage> = WindowList.resolveTrack(
  () => message('Other'),
  placed,
)

// @ts-expect-error The reading is one of the list's Messages, not the page's.
export const pageReading = WindowList.resolveTrack(() => message('Other'), message('Other'))

// @ts-expect-error `onMessage` takes the list's Messages.
export const foreignOnMessage = WindowList.resolveTrack((tag: TestMessage) => tag, placed)
