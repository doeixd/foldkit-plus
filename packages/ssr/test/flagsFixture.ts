/** An application with Flags, for Phase 2's checks that Flags never cross. */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from 'foldkit-surface'
import { SSR } from 'foldkit-ssr'

export const Flags = Schema.Struct({ theme: Schema.String, secret: Schema.String })
const Model = Schema.Struct({ theme: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Ping: {} })

const App = Surface.application({
  Model,
  Message,
  initial: { theme: 'light' },
  update: (model: Model) => ({ model }),
})

export const calls = { init: 0 }

export const config = {
  Model,
  Flags,
  init: (flags: typeof Flags.Type) => {
    calls.init++
    return { model: { theme: flags.theme } }
  },
  update: (model: Model) => ({ model }),
  view: (model: Model, h: HtmlBuilder<typeof Message.Type>) => ({
    title: 'Themed',
    body: h.p([h.Id('theme')], [model.theme]),
  }),
  container: null,
}

export const plan = SSR.plan(App, { id: 'themed', state: Projection.pick(App.model.theme) })

export const flags = { theme: 'dark', secret: 'server-only token' }
