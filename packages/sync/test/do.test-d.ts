/** `defineDocumentHost` asks for a `layer` exactly when its resolver needs a service. */
import { Context, Effect, Layer } from 'effect'
import { describe, it } from 'vitest'
import { defineDocumentHost } from '../src/do.js'
import { documentHost } from '../src/journal.js'
import { openJournal, Todos } from './fixtures/todos.js'

class Base {
  constructor(_ctx: unknown, _env: unknown) {}
}
class Sessions extends Context.Service<Sessions, { readonly who: Effect.Effect<string> }>()(
  'do-types/Sessions',
) {}
const sessions = Layer.succeed(Sessions, { who: Effect.succeed('ada') })
const common = { sync: Todos, openJournal: async () => openJournal() }
const needing = () => Effect.flatMap(Sessions, ({ who }) => who)

describe('defineDocumentHost', () => {
  it('takes the layer a resolver needs, and none for one that needs nothing', () => {
    defineDocumentHost(Base, { ...common, resolvePrincipal: needing, layer: () => sessions })
    defineDocumentHost(Base, { ...common, resolvePrincipal: () => Effect.succeed('ada') })
  })

  it('takes an inline resolver, inferring what it needs', () => {
    defineDocumentHost(Base, {
      ...common,
      resolvePrincipal: request =>
        Effect.flatMap(Sessions, ({ who }) => Effect.map(who, name => `${name}@${request.url}`)),
      layer: () => sessions,
    })
  })

  it('refuses a resolver that needs a service, with no layer', () => {
    // @ts-expect-error Sessions is provided by nothing
    defineDocumentHost(Base, { ...common, resolvePrincipal: needing })
  })

  it('refuses a layer that does not provide what the resolver needs', () => {
    defineDocumentHost(Base, {
      ...common,
      // @ts-expect-error what the resolver needs is not what the layer gives
      resolvePrincipal: needing,
      // @ts-expect-error the layer provides nothing of Sessions
      layer: () => Layer.empty,
    })
  })
})

describe('documentHost', () => {
  const hosted = { sync: Todos, journal: async () => openJournal() }

  it('takes the layer a resolver needs, and none for one that needs nothing', () => {
    documentHost({ ...hosted, resolvePrincipal: needing, layer: () => sessions })
    documentHost({ ...hosted, resolvePrincipal: () => Effect.succeed('ada') })
  })

  it('refuses a resolver that needs a service, with no layer', () => {
    // @ts-expect-error Sessions is provided by nothing
    documentHost({ ...hosted, resolvePrincipal: needing })
  })
})
