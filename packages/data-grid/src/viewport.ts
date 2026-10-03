import { Effect, Queue, Schema, Stream } from 'effect'
import type { Command } from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import type { Viewport } from './virtual.js'

const Model = Schema.Struct({
  top: Schema.Number,
  left: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
  /** The scroll container moved or changed size; the Mount reports it. */
  Measured: {
    top: Schema.Number,
    left: Schema.Number,
    width: Schema.Number,
    height: Schema.Number,
  },
  /** A reveal set the scroll offsets; the container's own scroll event confirms it later. */
  Revealed: { top: Schema.Number, left: Schema.Number },
})
type Message = typeof Message.Type

// A detached element measures NaN, and an overscroll less than nothing; neither
// may reach the window math. An unchanged reading returns the Model it was given.
const write = (model: Model, next: ReadonlyArray<readonly [keyof Model, number]>): Model => {
  const fields: Partial<Record<keyof Model, () => number>> = {}
  for (const [key, value] of next) {
    const clean = Math.max(0, value)
    if (Number.isFinite(value) && clean !== model[key]) fields[key] = () => clean
  }
  return Object.keys(fields).length === 0 ? model : modifyFields(model, fields)
}

/**
 * The scroll container's geometry, as the window math reads it. The grid
 * owns no scroll position of its own: the container's is the fact, reported
 * by the `Measure` Mount, and a reveal moves the container.
 */
const bundle = Bundle.make('GridViewport', {
  Model,
  Message,
  init: () => ({ model: { top: 0, left: 0, width: 0, height: 0 } }),
  update: (model: Model, message: Message) => ({
    model: Message.match(message, {
      Measured: ({ top, left, width, height }) =>
        write(model, [
          ['top', top],
          ['left', left],
          ['width', width],
          ['height', height],
        ]),
      Revealed: ({ top, left }) =>
        write(model, [
          ['top', top],
          ['left', left],
        ]),
    }),
  }),
})

interface Scroller {
  readonly scrollTop: number
  readonly scrollLeft: number
  readonly clientWidth: number
  readonly clientHeight: number
}

type ResizeObserverCtor = new (callback: () => void) => ResizeObserver

/**
 * Reports the element's scroll offsets and size: once when it mounts, then on
 * every scroll and every resize. Attach it to the scroll container. Without
 * `ResizeObserver` (a test DOM) it still reports scrolls.
 */
const Measure = Mount.defineStream('GridViewportMeasure', {
  messages: [Message.Measured],
  execute: ({ element }) =>
    Stream.callback<typeof Message.Measured.Type>(queue =>
      Effect.gen(function* () {
        const scroller = element as unknown as Scroller
        const report = () =>
          Queue.offerUnsafe(
            queue,
            Message.Measured({
              top: scroller.scrollTop,
              left: scroller.scrollLeft,
              width: scroller.clientWidth,
              height: scroller.clientHeight,
            }),
          )
        const Observer = (globalThis as { ResizeObserver?: ResizeObserverCtor }).ResizeObserver
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            // Built before anything listens, so a constructor that throws leaves nothing attached.
            const observer = Observer === undefined ? undefined : new Observer(report)
            element.addEventListener('scroll', report, { passive: true })
            observer?.observe(element)
            report()
            return observer
          }),
          observer =>
            Effect.sync(() => {
              element.removeEventListener('scroll', report)
              observer?.disconnect()
            }),
        )
      }),
    ),
})

/**
 * Scrolls the container with this DOM id to `offsets` (from
 * `VirtualGrid.reveal`) and reports `Revealed`, so the next window is drawn
 * from the new offsets at once rather than after the scroll event.
 */
const scrollTo = (
  viewportId: string,
  offsets: Pick<Viewport, 'top' | 'left'>,
): Command<Message> => ({
  name: 'GridViewport.scrollTo',
  args: { viewportId, ...offsets },
  effect: Effect.sync(() => {
    const element = typeof document === 'undefined' ? null : document.getElementById(viewportId)
    element?.scrollTo({ top: offsets.top, left: offsets.left })
    return Message.Revealed(offsets)
  }),
})

export const GridViewport = { Model, Message, bundle, Measure, scrollTo }
