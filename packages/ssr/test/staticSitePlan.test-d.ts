/**
 * A site's `plan` is a plan, or a function of the path that returns one:
 * anything else is refused where it is written.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from 'foldkit-surface'
import { SSR } from 'foldkit-ssr'
import type { StaticSite } from 'foldkit-ssr/vite'

const Model = Schema.Struct({ page: Schema.String })
const Message = defineMessageUnion({ Pressed: {} })
const App = Surface.application({
  Model,
  Message,
  initial: { page: '/' },
  update: model => ({ model }),
})
const plan = SSR.plan(App, { id: 'site', state: Projection.pick(App.model.page) })

declare const rest: Omit<StaticSite<any, any, any>, 'plan'>
declare const site: <F extends Schema.Struct.Fields>(
  site: StaticSite<typeof Model.Type, F, typeof Message.Type>,
) => void

site({ ...rest, plan })
site({ ...rest, plan: path => (path === '/' ? plan : plan) })
// @ts-expect-error a function of the path must return a plan
site({ ...rest, plan: (path: string) => path })
