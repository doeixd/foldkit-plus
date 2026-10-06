/**
 * A team page for the family checks: the roster names member ids, each member
 * reads its user from Remote, and the coach is read by the page itself — so
 * the envelope must carry the parent's read with the instances'.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineRouteUnion } from 'foldkit/route'
import { Entity, Remote } from 'foldkit-remote'
import { Projection, Surface } from 'foldkit-surface'
import { SSR } from 'foldkit-ssr'

export const AppRoute = defineRouteUnion({ Home: {}, Team: {} })

export const Model = Schema.Struct({
  route: AppRoute,
  members: Schema.Array(Schema.String),
  remote: Remote.Model,
})
export type Model = typeof Model.Type
export const Message = defineMessageUnion({ ...Remote.messages })
export type Message = typeof Message.Type

export const initial: Model = { route: AppRoute.Home(), members: [], remote: Remote.initial }

export const App = Surface.application({
  Model,
  Message,
  initial,
  update: (model: Model) => ({ model }),
})

const User = Entity.make('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
export const Data = Remote.make({ model: App.model.remote, entities: [User] })

const Team = App.surface('Team', {
  model: ({ model }) => ({
    members: model.members,
    coach: Data.get(User.select({ name: true }), 'c9'),
  }),
  messages: [],
})
export const team = Surface.when(Team, App.model.route, AppRoute.Team, () => undefined)

const Member = App.surface('Member', {
  params: { id: Schema.String },
  model: ({ params }) => ({ user: Data.get(User.select({ name: true }), params.id) }),
  messages: [],
})
export const Members = Surface.each(Member, {
  from: team,
  instances: ({ members }) => members.map(id => ({ key: id, params: { id } })),
})

const user = (id: string, name: string) => ({ entity: 'User', id, values: { name } })

/** The server's Model for the team page: the roster, and every user it names. */
export const loaded: Model = Data.reduce(
  { ...initial, route: AppRoute.Team(), members: ['u1', 'u2'] },
  {
    _tag: 'ReadReceived',
    requests: [
      { entity: 'User', id: 'c9', fields: ['name'] },
      { entity: 'User', id: 'u1', fields: ['name'] },
      { entity: 'User', id: 'u2', fields: ['name'] },
    ],
    result: {
      entities: [user('c9', 'Coach'), user('u1', 'Ada'), user('u2', 'Bo')],
      settled: [],
    },
    now: 0,
  },
)

/** The same page off its route: the roster stays, but the parent is inactive. */
export const offRoute: Model = { ...loaded, route: AppRoute.Home() }

export const config = {
  Model,
  init: () => ({ model: loaded }),
  update: (model: Model) => ({ model }),
  view: (model: Model, h: HtmlBuilder<typeof Message.Type>) => ({
    title: 'Team',
    body: h.p([h.Id('team')], [model.members.join(',')]),
  }),
  container: null,
}

export const plan = SSR.plan(App, {
  id: 'team',
  state: Projection.pick(App.model.route, App.model.members),
  surfaces: [Members],
  parts: [Remote.resume(Data)],
})
