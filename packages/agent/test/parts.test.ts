/**
 * Part discovery and the refusals that happen before a Message exists.
 * The save command's correlated outcomes live in `draft.test.ts`.
 */
import { Effect, Exit, Option, Schema } from 'effect'
import { Projection } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Agent } from '../src/index.js'
import {
  type Message,
  Message as Messages,
  type Model,
  type Principal,
  definition,
  initial,
  partCatalog,
} from './draftApp.js'
import { expectNoToken, expectSearchIdentity, matchOf } from './draftOutcome.js'

class TestHost {
  model: Model = initial()
  readonly dispatched: Array<Message> = []
  principal: Principal = { id: 'ada', editor: true }
  readonly host = {
    model: () => this.model,
    dispatch: (message: Message) => {
      this.dispatched.push(message)
    },
    principal: () => this.principal,
    subscribe: () => () => {},
    observe: () => () => {},
  }
}

const runtimeFor = (host: TestHost) => Agent.bind({ definition, host: host.host })

const twoSearches = [
  { part: 'search', id: 'first' },
  { part: 'search', id: 'second' },
] as const

const discover = (
  host: TestHost,
  query: Agent.UiQuery,
  mounted: ReadonlyArray<Agent.UiOccurrence<'search' | 'search.clear' | 'draft.save'>> = [],
) => Effect.runSync(Agent.Ui.discover(runtimeFor(host), partCatalog, query, mounted))

const failureOf = <E>(effect: Effect.Effect<unknown, E>): E => Effect.runSync(Effect.flip(effect))

describe('UI parts', () => {
  it('treats a shared label as ambiguous and shows only the named fields', () => {
    const host = new TestHost()
    const byLabel = discover(host, Agent.UiQuery.Label({ label: 'Search' }), twoSearches)
    const oneRow = discover(
      host,
      Agent.UiQuery.Occurrence({ part: 'search', id: 'first' }),
      twoSearches,
    )
    expectSearchIdentity(byLabel, oneRow)
    const encoded = Effect.runSync(runtimeFor(host).context)
    expect(encoded).toEqual({ query: 'q-value', draft: 'draft-secret' })
    expectNoToken(encoded)
  })

  it('treats one part mounted twice as ambiguous when asked by id', () => {
    const found = discover(new TestHost(), Agent.UiQuery.Part({ id: 'search' }), twoSearches)
    expect(found).toEqual(
      Agent.UiDiscovery.Ambiguous({
        label: 'Search',
        matches: [
          { id: 'search', occurrence: Option.some('first') },
          { id: 'search', occurrence: Option.some('second') },
        ],
      }),
    )
  })

  it('shows a field only when the part lists it, though the context holds it', () => {
    const save = matchOf(discover(new TestHost(), Agent.UiQuery.Part({ id: 'draft.save' })))
    expect(save.projection).toEqual({ draft: 'draft-secret' })
  })

  it('keeps a remounted control on the same part id and drops the old occurrence', () => {
    const host = new TestHost()
    const remounted = [{ part: 'search', id: 'first-b' }] as const
    const stale = discover(
      host,
      Agent.UiQuery.Occurrence({ part: 'search', id: 'first' }),
      remounted,
    )
    expect(stale).toEqual(Agent.UiDiscovery.None())
    const again = matchOf(discover(host, Agent.UiQuery.Part({ id: 'search' }), remounted))
    expect(again.id).toBe('search')
    expect(again.occurrence).toEqual(Option.some('first-b'))
  })

  it('does not let an occurrence of one part answer for another', () => {
    const found = discover(
      new TestHost(),
      Agent.UiQuery.Occurrence({ part: 'search.clear', id: 'first' }),
      twoSearches,
    )
    expect(found).toEqual(Agent.UiDiscovery.None())
  })

  it('discovers a part that is not mounted and does not invent one from a capability name', () => {
    const host = new TestHost()
    const clear = matchOf(discover(host, Agent.UiQuery.Part({ id: 'search.clear' })))
    expect(clear.occurrence).toEqual(Option.none())
    expect(clear.capability).toBe('clear_search')
    expect(discover(host, Agent.UiQuery.Part({ id: 'toggle' }))).toEqual(Agent.UiDiscovery.None())
    expect(discover(host, Agent.UiQuery.Label({ label: 'Toggle' }))).toEqual(
      Agent.UiDiscovery.None(),
    )
    const runtime = runtimeFor(host)
    expect(failureOf(Agent.Ui.invoke(runtime, partCatalog, 'toggle', {}))).toEqual(
      Agent.UnknownPartError.of('toggle'),
    )
    expect(host.dispatched).toEqual([])
  })

  it.each(['__proto__', 'constructor', 'toString'])(
    'reads the prototype key %s as no part',
    key => {
      const host = new TestHost()
      expect(discover(host, Agent.UiQuery.Part({ id: key }))).toEqual(Agent.UiDiscovery.None())
      expect(discover(host, Agent.UiQuery.Label({ label: key }))).toEqual(Agent.UiDiscovery.None())
      expect(failureOf(Agent.Ui.invoke(runtimeFor(host), partCatalog, key, {}))).toEqual(
        Agent.UnknownPartError.of(key),
      )
      expect(host.dispatched).toEqual([])
    },
  )

  it('omits an unavailable capability, mounted or not, and does not describe it as unauthorized', () => {
    const host = new TestHost()
    host.model = initial('viewer')
    const mounted = [{ part: 'draft.save', id: 'save' }] as const
    const asked = [
      Agent.UiQuery.Part({ id: 'draft.save' }),
      Agent.UiQuery.Label({ label: 'Save' }),
      Agent.UiQuery.Occurrence({ part: 'draft.save', id: 'save' }),
    ]
    for (const query of asked) {
      const save = discover(host, query, mounted)
      expect(save).toEqual(Agent.UiDiscovery.None())
      expect(JSON.stringify(save)).not.toContain('save_draft')
    }
    const runtime = runtimeFor(host)
    expect(
      failureOf(
        Agent.Ui.invoke(runtime, partCatalog, 'draft.save', { requestId: 'x', title: 'y' }),
      ),
    ).toBeInstanceOf(Agent.CapabilityUnavailableError)
    expect(host.dispatched).toEqual([])
  })

  it('refuses a principal before dispatch and keeps the refusal free of the Model', () => {
    const host = new TestHost()
    host.principal = { id: 'ada', editor: false }
    const save = matchOf(discover(host, Agent.UiQuery.Part({ id: 'draft.save' })))
    expect(save.capability).toBe('save_draft')
    expectNoToken(save)
    const failure = failureOf(
      Agent.Ui.invoke(runtimeFor(host), partCatalog, 'draft.save', { requestId: 'x', title: 'y' }),
    )
    expect(failure).toBeInstanceOf(Agent.AuthorizationError)
    expectNoToken(failure)
    expect(host.dispatched).toEqual([])
  })

  it('refuses a runtime bound to another definition', () => {
    const other = Agent.make({ context: definition.context, messages: definition.messages })
    const runtime = Agent.bind({ definition: other, host: new TestHost().host })
    const discovered = Effect.runSyncExit(
      Agent.Ui.discover(runtime, partCatalog, Agent.UiQuery.Part({ id: 'search' })),
    )
    const invoked = Effect.runSyncExit(Agent.Ui.invoke(runtime, partCatalog, 'search', {}))
    for (const exit of [discovered, invoked]) {
      expect(exit).toEqual(
        Exit.die(new Error('This part catalog was built for another definition')),
      )
    }
  })

  it('decodes an agent query only with a variant tag', () => {
    const decode = Schema.decodeUnknownExit(Agent.UiQuery)
    expect(decode({ _tag: 'Part', id: 'search' })).toEqual(
      Exit.succeed(Agent.UiQuery.Part({ id: 'search' })),
    )
    for (const sent of [{}, { id: 'search' }, { _tag: 'Part' }, { _tag: 'Occurrence', id: 'x' }]) {
      expect(Exit.isFailure(decode(sent))).toBe(true)
    }
  })
})

describe('the part catalog', () => {
  /** A definition whose capability names and context the checker cannot see. */
  const loose: Agent.Definition<Model, unknown, Principal> = definition

  it.each([
    [
      'an id bound twice',
      [
        { id: 'search', label: 'Search', capability: Messages.Typed },
        { id: 'search', label: 'Again', capability: Messages.Cleared },
      ],
      'A part id is already bound: search',
    ],
    ['an empty label', [{ id: 'search', label: '', capability: Messages.Typed }], 'needs a label'],
    [
      'a capability the definition does not expose',
      [{ id: 'draft', label: 'Draft', capability: Messages.DraftChanged }],
      'does not expose',
    ],
  ])('throws for %s', (_, parts, message) => {
    expect(() => Agent.Ui.catalog(loose, parts)).toThrow(message)
  })

  it('throws for a field the encoded context lacks, though the decoded one has it', () => {
    const Renamed = Schema.Struct({ query: Schema.String }).pipe(Schema.encodeKeys({ query: 'q' }))
    const renamed = Agent.make({
      context: Projection.fromReader(Renamed, (model: Model) => ({ query: model.query })),
      messages: definition.messages,
    })
    expect(() =>
      Agent.Ui.catalog(renamed, [
        { id: 'search', label: 'Search', capability: Messages.Typed, fields: ['query'] },
      ]),
    ).toThrow('Part search shows query, which the encoded context lacks')
  })

  it('resolves the capability to its protocol name and keeps its own copy of the fields', () => {
    const fields: Array<'query' | 'draft'> = ['query']
    const parts = Agent.Ui.catalog(definition, [
      { id: 'search', label: 'Search', capability: Messages.Typed, fields },
    ])
    fields.push('draft')
    expect(parts.part('search')).toEqual({
      id: 'search',
      label: 'Search',
      capability: 'set_query',
      fields: ['query'],
    })
  })
})
