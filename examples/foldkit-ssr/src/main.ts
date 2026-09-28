import * as UiButton from '@foldkit/ui/button'
import { Effect, Schema } from 'effect'
import { Command, type Runtime, type Update } from 'foldkit'
import { type Document, type Html, type HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Button } from 'foldkit-mixins-ui'
import { SSR } from 'foldkit-ssr/client'
import { Projection, Surface } from 'foldkit-surface'

import { COUNT_COOKIE } from './cookie.js'
import { ButtonStyle, PageStyle } from './style.js'

// MODEL

export const Model = Schema.Struct({
  count: Schema.Number,
  renderedAt: Schema.String,
  renderedOn: Schema.Literals(['Server', 'Client']),
})
export type Model = typeof Model.Type

// FLAGS

export const Flags = Schema.Struct({
  initialCount: Schema.Number,
  renderedAt: Schema.String,
  renderedOn: Schema.Literals(['Server', 'Client']),
})
export type Flags = typeof Flags.Type

// MESSAGE

export const Message = defineMessageUnion({
  ClickedDecrement: {},
  ClickedIncrement: {},
  CompletedPersistCount: {},
})

export type Message = typeof Message.Type

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedDecrement: () => {
      const nextCount = model.count - 1
      return {
        model: modifyFields(model, { count: () => nextCount }),
        commands: [PersistCount({ count: nextCount })],
      }
    },
    ClickedIncrement: () => {
      const nextCount = model.count + 1
      return {
        model: modifyFields(model, { count: () => nextCount }),
        commands: [PersistCount({ count: nextCount })],
      }
    },
    CompletedPersistCount: () => ({ model }),
  })

// COMMAND

const COUNT_COOKIE_MAX_AGE_SECONDS = 31536000

export const PersistCount = Command.define('PersistCount', {
  args: { count: Schema.Number },
  messages: [Message.CompletedPersistCount],
  execute: ({ count }) =>
    Effect.try(() => {
      document.cookie = `${COUNT_COOKIE}=${count}; path=/; max-age=${COUNT_COOKIE_MAX_AGE_SECONDS}`
    }).pipe(
      Effect.map(() => Message.CompletedPersistCount()),
      Effect.catch(() => Effect.succeed(Message.CompletedPersistCount())),
    ),
})

// INIT

export const init: Runtime.ApplicationInit<Model, Message, Flags> = flags => ({
  model: {
    count: flags.initialCount,
    renderedAt: flags.renderedAt,
    renderedOn: flags.renderedOn,
  },
})

// SSR

const App = Surface.application({ Model, Message })

/**
 * What crosses from the server to the browser: the Model `init` reached, every
 * field of it, since the page shows all three. The Flags stay on the server and
 * the browser never runs `init`. Nothing is left to start from the baseline, so
 * it is replaced whole and only has to be a Model.
 */
export const plan = SSR.plan(
  { initial: { count: 0, renderedAt: '', renderedOn: 'Client' } satisfies Model },
  {
    id: 'ssr',
    state: Projection.pick(App.model.count, App.model.renderedAt, App.model.renderedOn),
  },
)

// VIEW

type Slots = SlotBuilders<typeof PageStyle.slots, Message>

const counterButton = (onClick: Message, label: string, h: HtmlBuilder<Message>): Html =>
  UiButton.view(
    {
      onClick,
      toView: Button.toView([ButtonStyle.mixin], { h }, ({ button }) => h.button(button, [label])),
    },
    h,
  )

// NOTE: elements whose served markup and whose freshly built DOM are easy to
// get subtly different. A browser gives a later `selected` option ownership
// while the DOM `value` setter takes the first match, and it drops one newline
// after a <pre> or <textarea> start tag that assigning `innerHTML` would keep.
// Upstream's e2e suite loads this page once with scripting off and once
// hydrated, and requires the two readings to agree.
const parseEquivalenceView = (slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.equivalence.attrs([h.Id('parse-equivalence')]), [
    h.select(slots.equivalenceSelect.attrs([h.Id('equivalence-select'), h.Value('a')]), [
      h.option(slots.equivalenceOption.attrs([h.Value('a')]), ['A']),
      h.option(slots.equivalenceOption.attrs([h.Value('a'), h.Selected(true)]), ['B']),
    ]),
    h.pre(slots.equivalencePre.attrs([h.Id('equivalence-pre'), h.InnerHTML('\nleading')])),
    h.textarea(
      // A Slot's attributes are typed for any element, InnerHTML included, which
      // `h.textarea` refuses; nothing here supplies InnerHTML (a mixin cannot).
      slots.equivalenceTextarea.attrs([
        h.Id('equivalence-textarea'),
        h.Value('\nleading'),
      ]) as Parameters<typeof h.textarea>[0],
    ),
  ])

export const Page = SlotView.forMessages<Message>()
  .define(PageStyle.slots, (model: Model, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h1(slots.heading.attrs(), ['Server-rendered counter']),
      h.p(slots.count.attrs([h.Id('count')]), [model.count.toString()]),
      h.div(slots.controls.attrs(), [
        counterButton(Message.ClickedDecrement(), '-', h),
        counterButton(Message.ClickedIncrement(), '+', h),
      ]),
      h.p(slots.provenance.attrs([h.Id('provenance')]), [
        `Rendered on the ${model.renderedOn} at ${model.renderedAt}`,
      ]),
      h.p(slots.note.attrs(), [
        'The count persists in a cookie. Reload the page and the server ' +
          'renders your latest count into the HTML before any JavaScript runs.',
      ]),
      parseEquivalenceView(slots, h),
    ]),
  )
  .pipe(Style.attach(PageStyle.style))

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: `Count ${model.count}`,
  body: Page(model, h),
})
