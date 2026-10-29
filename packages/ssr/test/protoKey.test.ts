/**
 * A Message field named like an `Object.prototype` member is the hole an
 * event fills when nothing fixes it, not a field the prototype fixed.
 */
import { Effect, Record, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Resume, SSR } from 'foldkit-ssr'

const Model = Schema.Struct({ text: Schema.String })
type Model = typeof Model.Type

const Message = defineMessageUnion({
  TypedProto: Record.singleton('__proto__', Schema.String),
  TypedConstructor: { constructor: Schema.String },
  TypedToString: { toString: Schema.String },
})
type Message = typeof Message.Type

const initial: Model = { text: '' }
const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })
const Page = App.surface('Page', {
  model: ({ model }) => ({ text: model.text }),
  messages: [Message.TypedProto, Message.TypedConstructor, Message.TypedToString],
})

const config = {
  Model,
  init: () => ({ model: initial }),
  update: (model: Model) => ({ model }),
  view: (_model: Model, h: HtmlBuilder<Message>) => {
    const rh = Resume.builder(h)
    return {
      title: 'Page',
      body: rh.main(
        [],
        [
          rh.input([rh.OnInput(Message.TypedProto)]),
          rh.input([rh.OnInput(Message.TypedConstructor)]),
          rh.input([rh.OnInput(Message.TypedToString)]),
        ],
      ),
    }
  },
  container: null,
}

const plan = SSR.plan(App, {
  id: 'page',
  state: Projection.pick(App.model.text),
  surfaces: [Surface.at(Page, undefined)],
})

describe('a Message field named like a prototype member', () => {
  it('is the hole an input fills', async () => {
    const { envelope } = await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))
    const { bindings } = JSON.parse(
      envelope.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''),
    )
    expect(bindings.map((binding: { readonly hole: unknown }) => binding.hole)).toEqual([
      ['__proto__'],
      ['constructor'],
      ['toString'],
    ])
  })
})
