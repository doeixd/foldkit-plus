/**
 * The README's Diagnostics snippet, compiled against the fixture it assumes:
 * a config and plan, a build id, and a `send` of the application's own.
 */
import { Effect } from 'effect'
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
