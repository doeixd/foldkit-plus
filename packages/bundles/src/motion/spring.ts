/**
 * A spring as a bundle: a number pulled toward a target with stiffness and
 * damping, in the Model. Semi-implicit Euler at a fixed 16ms step, so the
 * trajectory is deterministic under TestClock; the stream ends with
 * Finished, and the value rests exactly at `to`. Underdamped springs
 * overshoot — that is the point — but the rest value is still exact.
 */
import { Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { Bundle } from 'foldkit-bundle'

export const SpringModel = Schema.Struct({
  value: Schema.Number,
  velocity: Schema.Number,
  running: Schema.Boolean,
})
export type SpringModel = typeof SpringModel.Type

export const SpringMessage = defineMessageUnion({
  Started: {},
  Stopped: {},
  Ticked: { value: Schema.Number, velocity: Schema.Number },
  /** Carries the exact end value: the integrator stops near it, not on it. */
  Finished: { value: Schema.Number },
})
export type SpringMessage = typeof SpringMessage.Type

const step = 16
const epsilon = 0.001

interface Point {
  readonly x: number
  readonly v: number
}

const settled = (point: Point, to: number): boolean =>
  Math.abs(to - point.x) < epsilon && Math.abs(point.v) < epsilon

export const Spring = Bundle.make('Spring', {
  Model: SpringModel,
  Message: SpringMessage,
  args: Schema.Struct({
    from: Schema.Number,
    to: Schema.Number,
    stiffness: Schema.Number.pipe(
      Schema.check(Schema.isGreaterThan(0)),
      Schema.check(Schema.isFinite()),
    ),
    damping: Schema.Number.pipe(
      Schema.check(Schema.isGreaterThan(0)),
      Schema.check(Schema.isFinite()),
    ),
  }),
  init: args => ({ model: { value: args.from, velocity: 0, running: false } }),
  update: (model, message) =>
    SpringMessage.match(message, {
      Started: () => ({ model: { ...model, running: true } }),
      Stopped: () => ({ model: { ...model, running: false } }),
      Ticked: ({ value, velocity }) => ({ model: { ...model, value, velocity } }),
      Finished: ({ value }) => ({ model: { ...model, value, velocity: 0, running: false } }),
    }),
  subscriptions: ({
    from,
    to,
    stiffness,
    damping,
  }): Subscription.Subscriptions<SpringModel, SpringMessage> =>
    Subscription.make<SpringModel, SpringMessage>()(entry => ({
      ticks: entry(
        { running: Schema.Boolean },
        {
          modelToDependencies: model => ({ running: model.running }),
          dependenciesToStream: ({ running }) => {
            if (!running) return Stream.empty
            // One integration step per tick, not per elapsed wall time: the
            // trajectory is identical on the live clock and TestClock, and a
            // stalled event loop slows the animation instead of catching up
            // all at once.
            const dt = step / 1000
            const points = Stream.tick(step).pipe(
              Stream.scan({ x: from, v: 0 }, point => {
                const force = -stiffness * (point.x - to) - damping * point.v
                const v = point.v + force * dt
                return { x: point.x + v * dt, v }
              }),
              // scan emits the seed (no movement yet) before the first step.
              Stream.drop(1),
            )
            return Stream.concat(
              points.pipe(
                Stream.takeUntil(point => settled(point, to)),
                Stream.map(point => SpringMessage.Ticked({ value: point.x, velocity: point.v })),
              ),
              Stream.make(SpringMessage.Finished({ value: to })),
            )
          },
        },
      ),
    })),
})
