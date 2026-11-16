// @vitest-environment node
/**
 * What crosses a Domain Api's wire when a lowered write fails on its own side
 * (#575). The Api is served by its own HTTP handler and asked by its own HTTP
 * client, and every response body is kept: a defect is encoded there with its
 * message and cause. So a guard's own sentence, which names a member a Read
 * rule hides, and what a rule's body threw are nowhere in those bytes, and the
 * report holds them under the incident the bytes carry; a declared refusal
 * still arrives as its Rejection.
 */
import * as Domain from '@alchemy.run/domain'
import * as InMemory from '@alchemy.run/domain/InMemory'
import { Effect, Layer, Option, Schema } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import { toWebHandlerLayerWith } from 'effect/http/HttpEffect'
import { RpcMiddleware } from 'effect/rpc'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Guards } from 'foldkit-guard'
import { Diagnostics, Mutation, type Diagnostic } from 'foldkit-remote'
import { afterEach, describe, expect, it } from 'vitest'
import { Lower } from '../../src/lower/index.js'

const User = Schema.Struct({ id: Schema.String })

const VaultFields = Entity.define(
  'Vault',
  Schema.Struct({
    id: Schema.String,
    ownerId: Schema.String,
    label: Schema.String,
    claimedBy: Schema.String,
    revision: Schema.Number,
  }),
)
const G = Guards.declare(
  'Vaults',
  User,
  guard => ({
    isAuditor: guard.principal(),
    isOwner: guard.row(VaultFields, user => Expr.eq(VaultFields.fields.ownerId, user.id)),
  }),
  { key: user => user.id, unguarded: 'allow' },
)
const Vault = VaultFields.pipe(
  Guards.attach(G, {
    row: { Read: [G.isOwner], Update: [G.isOwner, G.isAuditor] },
    // Who claimed a vault is an auditor's to read, not its owner's.
    members: { claimedBy: { Read: [G.isAuditor] } },
  }),
)
const Policy = G.implement({
  isAuditor: principal => {
    // A rule's body that breaks, in words nobody wrote for a caller.
    if (Option.exists(principal, user => user.id === 'boom'))
      throw new Error('SECRET-CANARY-rule: postgres://admin:hunter2@db.internal/app')
    return false
  },
})

/** A relabel whose precondition reads the member its writer may not: the guard fails it, naming the member. */
const Probe = Mutation.write(
  'Probe',
  Write.update(
    Entity.input(
      Vault,
      Schema.Struct({
        id: Schema.String,
        revision: Schema.Number,
        label: Schema.String,
        guess: Schema.String,
      }),
      { guess: Entity.unmapped },
    ),
    {
      id: 'id',
      expect: 'revision',
      when: ({ input }) => Expr.eq(Vault.fields.claimedBy, input.guess),
    },
  ),
)
const Relabel = Mutation.write(
  'Relabel',
  Write.update(
    Entity.input(
      Vault,
      Schema.Struct({ id: Schema.String, revision: Schema.Number, label: Schema.String }),
    ),
    { id: 'id', expect: 'revision' },
  ),
)

class CurrentUser extends Domain.RequestContext<CurrentUser>()(
  'InternalFailure/CurrentUser',
  Schema.OptionFromNullOr(User),
) {}
class Session extends RpcMiddleware.Service<Session, { provides: CurrentUser }>()(
  'InternalFailure/Session',
) {}
const SessionLive = Layer.succeed(Session, (effect, { headers }) =>
  Effect.provideService(
    effect,
    CurrentUser,
    Option.map(Option.fromUndefinedOr(headers['x-user']), id => ({ id })),
  ),
)

class Listed extends Domain.Event('VaultListed', { row: Vault.schema }) {}
class Relabeled extends Domain.Event('VaultRelabeled', {
  label: Schema.String,
  revisionAfter: Schema.Number,
}) {}

const lowering = {
  policy: Policy,
  revision: 'revision',
  principal: CurrentUser,
  middleware: [Session],
  listed: Listed,
  event: Relabeled,
  record: (after: typeof Vault.schema.Type) =>
    new Relabeled({ label: after.label, revisionAfter: after.revision }),
  apply: (row: typeof Vault.schema.Type, event: Relabeled) => ({
    ...row,
    label: event.label,
    revision: event.revisionAfter,
  }),
} as const
const Probed = Lower.write(Probe, lowering)
const Relabeling = Lower.write(Relabel, lowering)

class List extends Domain.Command('ListVault', {
  target: Schema.String,
  input: { row: Vault.schema },
  events: [Listed],
}) {}
class Relist extends Domain.Command('RelistVault', {
  target: Schema.String,
  input: { row: Vault.schema },
  events: [Listed],
}) {}

class ProbedVault extends Domain.Aggregate('ProbedVault', {
  id: Schema.String,
  state: Probed.state,
  initial: Probed.initial,
  commands: [List, Probed.command],
  decide: {
    ListVault: (_, command) => [new Listed({ row: command.row })],
    Probe: Probed.decide,
  },
  evolve: Probed.evolve,
  reply: { Probe: Probed.reply },
}) {}
class RelabeledVault extends Domain.Aggregate('RelabeledVault', {
  id: Schema.String,
  state: Relabeling.state,
  initial: Relabeling.initial,
  commands: [Relist, Relabeling.command],
  decide: {
    RelistVault: (_, command) => [new Listed({ row: command.row })],
    Relabel: Relabeling.decide,
  },
  evolve: Relabeling.evolve,
  reply: { Relabel: Relabeling.reply },
}) {}

class Vaults extends Domain.Model('Vaults', {
  aggregates: [ProbedVault, RelabeledVault],
  views: [],
}) {}
class VaultsApi extends Domain.Api('VaultsApi', {
  model: Vaults,
  commands: ['ListVault', 'RelistVault', 'Probe', 'Relabel'],
  views: [],
}) {}

const row = { id: 'v1', ownerId: 'ada', label: 'gold', claimedBy: 'grace', revision: 1 }

const disposals: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const dispose of disposals.splice(0)) await dispose()
})

/**
 * The Api behind its own HTTP handler and asked through its own HTTP client,
 * whose `fetch` is the handler: every response body it answered is in `sent`.
 */
const served = async <A, E>(
  body: (client: (typeof VaultsApi.Client)['Service']) => Effect.Effect<A, E>,
) => {
  const collected = Diagnostics.collect()
  const { layer: platform } = InMemory.make({ manual: true })
  const hosted = Layer.mergeAll(
    SessionLive,
    Layer.succeed(Diagnostics.Reporter, collected.report),
  ).pipe(Layer.provideMerge(Vaults.layer(Layer.empty).pipe(Layer.provide(platform))))
  const web = toWebHandlerLayerWith(hosted, {
    toHandler: context => Effect.map(Effect.provideContext(VaultsApi, context), api => api.fetch),
  })
  disposals.push(web.dispose)
  const sent: Array<string> = []
  const fetching: typeof globalThis.fetch = async (input, init) => {
    const response = await web.handler(new Request(input, init))
    sent.push(await response.clone().text())
    return response
  }
  const exit = await Effect.runPromiseExit(
    Effect.gen(function* () {
      const client = yield* VaultsApi.Client
      yield* client.ListVault('v1', { row })
      yield* client.RelistVault('v1', { row })
      sent.length = 0
      return yield* body(client)
    }).pipe(
      Effect.scoped,
      Effect.provide(
        VaultsApi.layerClientHttp('http://domain.test').pipe(
          Layer.provide(FetchHttpClient.layer),
          Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetching)),
        ),
      ),
    ),
  )
  return { exit, sent: sent.join('\n'), reported: collected.reported }
}

const as = (id: string) => ({ headers: { 'x-user': id } })
const defects = (reported: ReadonlyArray<Diagnostic>) =>
  reported.filter(report => report._tag === 'ServerDefect')
const incidentIn = (sent: string) => /Internal error, incident ([0-9a-f]{16})/.exec(sent)?.[1]

describe('a lowered write that fails on its own side, over the Domain Api’s HTTP transport', () => {
  it('sends nothing of the guard’s own sentence, which names a hidden member', async () => {
    const { exit, sent, reported } = await served(client =>
      client.Probe('v1', { revision: 1, label: 'mine', guess: 'grace' }, as('ada')),
    )
    expect(exit._tag).toBe('Failure')
    expect(sent).not.toMatch(/claimedBy|Read rule|hides/)
    const incident = incidentIn(sent)
    expect(incident).toBeDefined()
    expect(defects(reported)).toEqual([
      expect.objectContaining({
        incident,
        during: 'decide Probe',
        message: expect.stringContaining(
          "Vault's write reads claimedBy, which a Read rule hides from its writer",
        ),
      }),
    ])
  })

  it('sends nothing of what a rule’s body threw', async () => {
    const { exit, sent, reported } = await served(client =>
      client.Relabel('v1', { revision: 1, label: 'mine' }, as('boom')),
    )
    expect(exit._tag).toBe('Failure')
    expect(sent).not.toMatch(/SECRET-CANARY|hunter2|postgres/)
    const incident = incidentIn(sent)
    expect(incident).toBeDefined()
    expect(defects(reported)).toEqual([
      expect.objectContaining({
        incident,
        during: 'decide Relabel',
        message: expect.stringContaining('SECRET-CANARY-rule'),
      }),
    ])
  })

  it('still sends a declared refusal as its Rejection, and reports nothing', async () => {
    const stale = await served(client =>
      client.Relabel('v1', { revision: 7, label: 'mine' }, as('ada')),
    )
    expect(stale.sent).toContain('Conflict')
    expect(stale.sent).not.toContain('Internal error')
    expect(stale.reported).toEqual([])
    const other = await served(client =>
      client.Relabel('v1', { revision: 1, label: 'mine' }, as('eve')),
    )
    expect(other.sent).toContain('Forbidden')
    expect(other.reported).toEqual([])
  })
})
