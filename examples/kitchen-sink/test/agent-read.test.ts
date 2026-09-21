/**
 * data-query-DESIGN §29.2: a named query as a read capability an agent is
 * given, instead of database access.
 *
 * The claims worth testing are about the *boundary* rather than the plumbing:
 * what the agent can ask, what it cannot, and whether being asked can cause a
 * read.
 */
import { Agent } from 'foldkit-agent'
import { Remote } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { AppAgent } from '../src/agent.js'
import { App, Data, ProjectSummary, ProjectsByOwner } from '../src/stack.js'

/** What an adapter publishes: a name, a description, and a JSON Schema. */
const published = Agent.resources(AppAgent).find(one => one.name === 'projects')!
/** What the application declared, which is where the read lives. */
const declared = AppAgent.resources.find(one => one.name === 'projects')!

const projects = Data.query(
  ProjectsByOwner,
  { ownerId: 'u1' },
  { select: ProjectSummary, first: 25 },
)

describe('A query given to an agent as a read capability', () => {
  it('is offered by name, described, and with a schema an adapter can publish', () => {
    expect(published.name).toBe('projects')
    expect(published.description).toContain('projects')
    expect(published.schema).toBeDefined()
  })

  it('answers from the Model, so nothing it is asked can cause a read', () => {
    // Before anything is fetched the honest answer is that nothing is known —
    // not an error, and not a request to the server.
    expect(declared.read(App.initial)).toEqual({ _tag: 'Initial' })
  })

  it('shows what the application already fetched, once it has', () => {
    const merged = Data.reduce(App.initial, {
      _tag: 'ConnectionMerged',
      connection: projects.ref.identity,
      page: {
        edges: [{ key: 'Project:p1', ref: { entity: 'Project', id: 'p1' } }],
        start: { _tag: 'Terminal' },
        end: { _tag: 'Terminal' },
      },
    })
    // The Selection reaches through `owner`, so the page is not known until the
    // owner is either — which is the ordinary rule, and applies to the agent's
    // read exactly as it applies to a view's.
    const loaded = Data.reduce(merged, {
      _tag: 'ReadReceived',
      requests: [
        { entity: 'Project', id: 'p1', fields: ['id', 'name', 'status', 'owner'] },
        { entity: 'User', id: 'u1', fields: ['name'] },
      ],
      result: {
        entities: [
          {
            entity: 'Project',
            id: 'p1',
            values: { id: 'p1', name: 'Apollo', status: 'active', owner: 'User:u1' },
          },
          { entity: 'User', id: 'u1', values: { name: 'Ada' } },
        ],
      },
      now: 0,
    })

    expect(declared.read(loaded)).toMatchObject({
      _tag: 'Ready',
      value: { items: [{ name: 'Apollo', owner: { name: 'Ada' } }] },
    })
  })

  it('is the one question the application wrote, not a query language', () => {
    // What reaches the agent is a name, a description and a shape. Not an
    // `Expr`, not the definition, not the input: the owner, the Selection and
    // the page size were all decided on this side.
    expect(Object.keys(published).sort()).toEqual(['description', 'name', 'schema'])
    expect(published).not.toHaveProperty('body')
    expect(published).not.toHaveProperty('read')
  })

  it('reads the connection the application reads, not a second one', () => {
    // Nothing is duplicated for the agent's benefit, so what it sees and what a
    // view shows cannot drift apart.
    expect(declared.read(App.initial)).toEqual(projects.read(App.initial))
  })
})

describe('What the agent contract still refuses', () => {
  it('exposes only the Messages the application named', () => {
    const named = Agent.messages(AppAgent).map(message => message.name)

    expect(named).toContain('rename_note')
    expect(named).not.toContain('Ping')
  })

  it('keeps the Remote Messages out of the agent surface entirely', () => {
    const named = Agent.messages(AppAgent).map(message => message.name)

    for (const remote of Object.keys(Remote.messages)) {
      expect(named).not.toContain(remote)
    }
  })
})
