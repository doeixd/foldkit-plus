/**
 * Part discovery and the refusals that happen before a Message exists.
 * The save command's correlated outcomes live in `draft.test.ts`.
 */
import { Cause, Effect, Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { Agent } from '../src/index.js'
import { type Message, type Model, definition, initial, partCatalog } from './draftApp.js'
import { expectNoToken, expectSearchIdentity } from './draftOutcome.js'

class TestHost {
  model: Model = initial()
  readonly dispatched: Array<Message> = []
  principal: { readonly id: string; readonly editor: boolean } = { id: 'ada', editor: true }
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

const discover = (host: TestHost, query: Parameters<typeof Agent.Ui.discover>[2]) =>
  Effect.runSync(Agent.Ui.discover(runtimeFor(host), partCatalog, query))

const failureOf = (effect: Effect.Effect<unknown, unknown>) => {
  const result = Effect.runSync(Effect.result(effect))
  if (result._tag !== 'Failure') throw new Error(`Expected a failure, got ${result._tag}`)
  return result.failure as { readonly _tag: string }
}

describe('UI parts', () => {
  it('treats a shared label as ambiguous and shows only the named fields', () => {
    const host = new TestHost()
    const byLabel = discover(host, {
      label: 'Search',
      mounted: [
        { part: 'search', id: 'first' },
        { part: 'search', id: 'second' },
      ],
    })
    const oneRow = discover(host, {
      id: 'search',
      occurrence: 'first',
      mounted: [
        { part: 'search', id: 'first' },
        { part: 'search', id: 'second' },
      ],
    })
    expectSearchIdentity(byLabel, oneRow)
    const encoded = Effect.runSync(runtimeFor(host).context)
    expect(encoded).toEqual({ query: 'q-value', draft: 'draft-secret' })
    expectNoToken(encoded)
  })

  it('keeps a remounted control on the same part id and drops the old occurrence', () => {
    const host = new TestHost()
    const stale = discover(host, {
      id: 'search',
      occurrence: 'first',
      mounted: [{ part: 'search', id: 'first-b' }],
    })
    expect(stale._tag).toBe('None')
    const again = discover(host, {
      id: 'search',
      mounted: [{ part: 'search', id: 'first-b' }],
    })
    expect(again._tag).toBe('Match')
    if (again._tag !== 'Match') return
    expect(again.id).toBe('search')
    expect(Option.getOrThrow(again.occurrence)).toBe('first-b')
  })

  it('discovers a part that is not mounted and does not invent one from a capability name', () => {
    const host = new TestHost()
    const clear = discover(host, { id: 'search.clear', mounted: [] })
    expect(clear._tag).toBe('Match')
    if (clear._tag !== 'Match') return
    expect(Option.isNone(clear.occurrence)).toBe(true)
    expect(clear.capability).toBe('clear_search')
    const missing = discover(host, { id: 'toggle', label: 'Toggle' })
    expect(missing._tag).toBe('None')
    const runtime = runtimeFor(host)
    expect(failureOf(Agent.Ui.invoke(runtime, partCatalog, 'toggle', {}))._tag).toBe(
      'AgentUnknownPartError',
    )
    expect(host.dispatched).toEqual([])
  })

  it('omits an unavailable capability and does not describe it as unauthorized', () => {
    const host = new TestHost()
    host.model = initial('viewer')
    const save = discover(host, { id: 'draft.save', label: 'Save' })
    expect(save._tag).toBe('None')
    expectNoToken(save)
    expect(JSON.stringify(save)).not.toContain('save_draft')
    const runtime = runtimeFor(host)
    expect(
      failureOf(Agent.Ui.invoke(runtime, partCatalog, 'draft.save', { requestId: 'x', title: 'y' }))
        ._tag,
    ).toBe('AgentCapabilityUnavailableError')
    expect(host.dispatched).toEqual([])
  })

  it('refuses a principal before dispatch and keeps the refusal free of the Model', () => {
    const host = new TestHost()
    host.principal = { id: 'ada', editor: false }
    const save = discover(host, { id: 'draft.save' })
    expect(save._tag).toBe('Match')
    if (save._tag !== 'Match') return
    expect(save.capability).toBe('save_draft')
    expect(save.projection).toEqual({ draft: 'draft-secret' })
    expectNoToken(save)
    const runtime = runtimeFor(host)
    const failure = failureOf(
      Agent.Ui.invoke(runtime, partCatalog, 'draft.save', { requestId: 'x', title: 'y' }),
    )
    expect(failure._tag).toBe('AgentAuthorizationError')
    expectNoToken(failure)
    expect(host.dispatched).toEqual([])
  })

  it('rejects a catalog that binds one id twice, and drops properties it does not declare', () => {
    expect(() =>
      Agent.Ui.catalog([
        { id: 'search', label: 'Search', capability: 'set_query' },
        { id: 'search', label: 'Again', capability: 'clear_search' },
      ]),
    ).toThrow('already bound')
    const extra: Agent.UiPart & { readonly setTitle: () => string } = {
      id: 'search',
      label: 'Search',
      capability: 'set_query',
      setTitle: () => 'no',
    }
    expect(Object.hasOwn(Agent.Ui.catalog([extra]).parts[0]!, 'setTitle')).toBe(false)
  })

  it('refuses a lookup that names neither a part nor a label', () => {
    const host = new TestHost()
    const exit = Effect.runSyncExit(Agent.Ui.discover(runtimeFor(host), partCatalog, {}))
    expect(exit._tag).toBe('Failure')
    if (exit._tag !== 'Failure') return
    expect(Cause.squash(exit.cause)).toEqual(new Error('Discovery names a part id or a label'))
  })
})
