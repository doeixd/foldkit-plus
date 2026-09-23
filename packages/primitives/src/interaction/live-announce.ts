/**
 * Announcements for assistive technology: one Bundle, placed once, holds the
 * text of a polite and an assertive live region. An announcement waits
 * `debounceMs` so a burst reads once, then clears after `clearAfterMs`, both
 * on Effect's clock with a generation so a superseded timer changes nothing.
 * The same text twice gets a trailing no-break space toggled, which is what
 * makes a screen reader read it again. `view` renders the two regions; put it
 * once in the page and style them visually hidden.
 */
import { Effect, Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Bundle, type Declared } from 'foldkit-bundle'

export const Politeness = Schema.Literals(['polite', 'assertive'])
export type Politeness = typeof Politeness.Type

export const Model = Schema.Struct({
  polite: Schema.String,
  assertive: Schema.String,
  /** Waiting for the debounce to read. */
  pending: Schema.NullOr(Schema.Struct({ message: Schema.String, politeness: Politeness })),
  generation: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  Announced: { message: Schema.String, politeness: Politeness },
  Read: { generation: Schema.Number },
  Cleared: { generation: Schema.Number },
})
export type Message = typeof Message.Type

const positive = Schema.Number.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0)),
  Schema.check(Schema.isFinite()),
)

export const Args = Schema.Struct({
  /** A burst of announcements inside this window reads once, the last one. */
  debounceMs: positive,
  /** How long the text stays in the region. */
  clearAfterMs: positive,
})
export type Args = typeof Args.Type

const NBSP = ' '

/** The text to put in the region so that `next` is read even when it equals `current`. */
export const reread = (current: string, next: string): string =>
  current === next ? `${next}${NBSP}` : current === `${next}${NBSP}` ? next : next

type Return = Update.Return<Model, Message>

const after = (ms: number, message: Message, name: string, generation: number) => ({
  name,
  args: { generation },
  effect: Effect.as(Effect.sleep(ms), message),
})

export const bundle = Bundle.make('LiveAnnounce', {
  Model,
  Message,
  args: Args,
  init: () => ({ model: { polite: '', assertive: '', pending: null, generation: 0 } }),
  update: (model, message, args): Return =>
    Message.match<Return>(message, {
      Announced: ({ message: text, politeness }) => {
        const generation = model.generation + 1
        return {
          model: { ...model, pending: { message: text, politeness }, generation },
          commands: [
            after(args.debounceMs, Message.Read({ generation }), 'LiveAnnounce.read', generation),
          ],
        }
      },
      Read: ({ generation }) => {
        if (generation !== model.generation || model.pending === null) return { model }
        const { message: text, politeness } = model.pending
        const region = politeness === 'polite' ? 'polite' : 'assertive'
        return {
          model: { ...model, pending: null, [region]: reread(model[region], text) },
          commands: [
            after(
              args.clearAfterMs,
              Message.Cleared({ generation }),
              'LiveAnnounce.clear',
              generation,
            ),
          ],
        }
      },
      Cleared: ({ generation }) =>
        generation === model.generation
          ? { model: { ...model, polite: '', assertive: '' } }
          : { model },
    }),
})

/** The parent Message that announces `text`, to return from `update` or `onOut`. */
export const say =
  <Field extends string>(declared: Declared<typeof bundle, Field>) =>
  <ParentMessage>(text: string, politeness: Politeness = 'polite'): ParentMessage =>
    declared.wrapper.make(
      Message.Announced({ message: text, politeness }),
    ) as unknown as ParentMessage

export const REGION_ATTRIBUTE = 'data-foldkit-plus-live'

/**
 * The two live regions. Render once, anywhere in the page, and hide them
 * visually with a rule on `[data-foldkit-plus-live]`; they must stay in the
 * accessibility tree, so no `display: none`.
 */
export const view = <ParentMessage>(model: Model, h: HtmlBuilder<ParentMessage>): Html =>
  h.div(
    [h.Attribute(REGION_ATTRIBUTE, 'regions')],
    [
      h.div(
        [h.Attribute(REGION_ATTRIBUTE, 'polite'), h.AriaLive('polite'), h.AriaAtomic(true)],
        [model.polite],
      ),
      h.div(
        [h.Attribute(REGION_ATTRIBUTE, 'assertive'), h.AriaLive('assertive'), h.AriaAtomic(true)],
        [model.assertive],
      ),
    ],
  )
