/**
 * The README's Diagnostics snippet, compiled against the fixture it assumes:
 * a config and plan, a build id, and a `send` of the application's own.
 */
import { Effect, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineRouteUnion } from 'foldkit/route'
import { Projection, Surface } from 'foldkit-surface'
import { SSR as Server, type Diagnostic, type SsrDiagnostic } from 'foldkit-ssr'
import { SSR } from 'foldkit-ssr/client'
import { config, plan } from './handoverFixture.js'

declare const buildId: string
declare const send: (diagnostic: Diagnostic) => Effect.Effect<void>

SSR.hydrate(config, plan, { buildId, diagnostics: diagnostic => send(diagnostic) })

Server.entry(config, plan, {
  buildId,
  diagnostics: (diagnostic, request) =>
    Effect.logError(`${request.method} ${request.url}: ${diagnostic.message}`),
})

// The union narrows by tag to each variant's facts.
declare const reported: SsrDiagnostic
if (reported._tag === 'PageContained') {
  const reason:
    | 'NoBuildId'
    | 'OtherBuild'
    | 'Route'
    | 'Plan'
    | 'Missing'
    | 'Duplicate'
    | 'Unreadable'
    | 'Protocol'
    | 'Invalid' = reported.reason
  void reason
}
// @ts-expect-error: a reporter returns an Effect, not a promise
SSR.hydrate(config, plan, { buildId, diagnostics: async () => {} })

// The README's `status` snippet, over a Model whose route has a NotFound case.
{
  const AppRoute = defineRouteUnion({ Home: {}, Post: { id: Schema.String }, NotFound: {} })
  const Model = Schema.Struct({ route: AppRoute })
  const App = Surface.application({
    Model,
    Message: defineMessageUnion({ Opened: {} }),
    initial: { route: AppRoute.Home() },
    update: model => ({ model }),
  })
  const Post = SSR.plan(App, { id: 'post', state: Projection.pick(App.model.route) })
  const routed = {
    Model,
    init: () => ({ model: { route: AppRoute.NotFound() } }),
    update: (model: typeof Model.Type) => ({ model }),
    view: (_model: typeof Model.Type, h: HtmlBuilder<never>) => h.p([], []),
    container: null,
  }

  Server.entry(routed, Post, {
    buildId,
    status: model =>
      AppRoute.match(model.route, { Home: () => 200, Post: () => 200, NotFound: () => 404 }),
  })
}

// The README's `prerendered` snippet: one list for the entry and the plugin.
{
  const prerenderPaths = ['/']
  Server.entry(config, plan, { buildId, prerendered: prerenderPaths })
}
