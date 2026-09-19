import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { Remote, emptyStore, entityKey, entry, isTombstone, plan, windowKey } from '../src/index.js'

describe('Remote.writeRead', () => {
  it('writes values and records the applied window', () => {
    const store = Remote.writeRead(
      emptyStore,
      [
        {
          entity: 'Project',
          id: 'p1',
          fields: ['comments'],
          windows: { comments: { first: 5 } },
        },
      ],
      { entities: [{ entity: 'Project', id: 'p1', values: { comments: [] } }] },
    )

    const written = Option.getOrThrow(entry(store, entityKey('Project', 'p1')))
    expect(written.values).toEqual({ comments: [] })
    expect(written.windows).toEqual({ comments: windowKey({ first: 5 }) })
  })

  it('records no window for a request without one', () => {
    const store = Remote.writeRead(emptyStore, [{ entity: 'User', id: 'u1', fields: ['name'] }], {
      entities: [{ entity: 'User', id: 'u1', values: { name: 'ada' } }],
    })

    expect(Option.getOrThrow(entry(store, entityKey('User', 'u1'))).windows).toEqual({})
  })

  const page = (refs: ReadonlyArray<string>, hasNext: boolean, hasPrevious: boolean) => ({
    refs,
    hasNext,
    hasPrevious,
  })

  const commentsOf = (store: ReturnType<typeof Remote.writeRead>) =>
    Option.getOrThrow(entry(store, entityKey('Project', 'p1'))).values.comments

  const writePage = (
    store: ReturnType<typeof Remote.writeRead>,
    window: { first?: number; last?: number; after?: string; before?: string },
    comments: ReturnType<typeof page>,
  ) =>
    Remote.writeRead(
      store,
      [{ entity: 'Project', id: 'p1', fields: ['comments'], windows: { comments: window } }],
      { entities: [{ entity: 'Project', id: 'p1', values: { comments } }] },
    )

  it('appends an after page onto the stored page', () => {
    const first = writePage(
      emptyStore,
      { first: 2 },
      page(['Comment:c1', 'Comment:c2'], true, false),
    )
    const second = writePage(
      first,
      { first: 2, after: 'Comment:c2' },
      page(['Comment:c3'], false, true),
    )

    // hasNext comes from the new page; hasPrevious stays the stored page's.
    expect(commentsOf(second)).toEqual(
      page(['Comment:c1', 'Comment:c2', 'Comment:c3'], false, false),
    )
  })

  it('merges cursor pages onto a page written earlier in the same result', () => {
    const first = writePage(emptyStore, { first: 1 }, page(['Comment:c1'], true, false))
    const both = Remote.writeRead(
      first,
      [
        {
          entity: 'Project',
          id: 'p1',
          fields: ['comments'],
          windows: { comments: { first: 1, after: 'Comment:c1' } },
        },
        {
          entity: 'Project',
          id: 'p1',
          fields: ['comments'],
          windows: { comments: { first: 1, after: 'Comment:c2' } },
        },
      ],
      {
        entities: [
          { entity: 'Project', id: 'p1', values: { comments: page(['Comment:c2'], true, true) } },
          { entity: 'Project', id: 'p1', values: { comments: page(['Comment:c3'], false, true) } },
        ],
      },
    )

    expect(commentsOf(both)).toEqual(page(['Comment:c1', 'Comment:c2', 'Comment:c3'], false, false))
  })

  it('prepends a before page ahead of the stored page', () => {
    const stored = writePage(
      emptyStore,
      { first: 2, after: 'x' },
      page(['Comment:c3', 'Comment:c4'], false, true),
    )
    const prepended = writePage(
      stored,
      { last: 2, before: 'Comment:c3' },
      page(['Comment:c1', 'Comment:c2'], true, false),
    )

    // hasPrevious comes from the new page; hasNext stays the stored page's.
    expect(commentsOf(prepended)).toEqual(
      page(['Comment:c1', 'Comment:c2', 'Comment:c3', 'Comment:c4'], false, false),
    )
  })

  it('replaces rather than merges when the window has no cursor', () => {
    const first = writePage(emptyStore, { first: 2 }, page(['Comment:c1'], true, false))
    const second = writePage(first, { first: 2 }, page(['Comment:c1'], false, false))

    expect(commentsOf(second)).toEqual(page(['Comment:c1'], false, false))
  })

  it('replaces rather than merges a malformed ref page', () => {
    const stored = writePage(emptyStore, { first: 2 }, page(['Comment:c1'], true, false))
    const malformed = [
      { refs: ['Comment:c2', 42], hasNext: false, hasPrevious: true },
      { refs: ['Comment:c2'], hasNext: 'no', hasPrevious: true },
      { refs: ['Comment:c2'], hasNext: false, hasPrevious: 'yes' },
    ]

    for (const value of malformed) {
      const written = writePage(
        stored,
        { first: 2, after: 'Comment:c1' },
        value as unknown as ReturnType<typeof page>,
      )
      expect(commentsOf(written)).toEqual(value)
    }
  })

  describe('what the answer leaves out', () => {
    const user = (id: string) => ({ entity: 'User', id, fields: ['name'] })
    const ada = { entity: 'User', id: 'u1', values: { name: 'ada' } }

    it('marks a requested id the server did not return as known absent', () => {
      const store = Remote.writeRead(emptyStore, [user('u1'), user('nope')], { entities: [ada] })

      expect(isTombstone(store, entityKey('User', 'u1'))).toBe(false)
      expect(isTombstone(store, entityKey('User', 'nope'))).toBe(true)
    })

    it('leaves the target of a returned ref alone, so the planner can ask for it by id', () => {
      const project = {
        entity: 'Project',
        id: 'p1',
        fields: ['owner'],
        relations: { owner: { entity: 'User', fields: ['name'] } },
      }
      // A server that does not expand the relation: valid, the client follows it next.
      const store = Remote.writeRead(emptyStore, [project], {
        entities: [{ entity: 'Project', id: 'p1', values: { owner: 'User:u1' } }],
      })

      expect(entry(store, entityKey('User', 'u1'))).toEqual(Option.none())
      expect(plan(store, [project])).toEqual([user('u1')])

      // Asked for by id and still not returned: now it is known absent.
      const second = Remote.writeRead(store, [user('u1')], { entities: [] })
      expect(isTombstone(second, entityKey('User', 'u1'))).toBe(true)
      expect(plan(second, [project])).toEqual([])
    })

    it('is not planned again, until a refresh forces it or a write brings it back', () => {
      const absent = Remote.writeRead(emptyStore, [user('nope')], { entities: [] })

      expect(plan(absent, [user('nope')])).toEqual([])
      expect(plan(absent, [user('nope')], { force: true })).toEqual([user('nope')])

      const back = Remote.writeRead(absent, [user('nope')], {
        entities: [{ entity: 'User', id: 'nope', values: { name: 'new' } }],
      })
      expect(isTombstone(back, entityKey('User', 'nope'))).toBe(false)
    })

    it('forgets what it held of an entity a later read leaves out', () => {
      const held = Remote.writeRead(emptyStore, [user('u1')], { entities: [ada] })
      const gone = Remote.writeRead(held, [user('u1')], { entities: [] })

      expect(isTombstone(gone, entityKey('User', 'u1'))).toBe(true)
      expect(Option.getOrThrow(entry(gone, entityKey('User', 'u1'))).values).toEqual({})
    })

    it('leaves alone an entity the read did not ask about', () => {
      const held = Remote.writeRead(emptyStore, [user('u1')], { entities: [ada] })
      const other = Remote.writeRead(held, [user('u2')], {
        entities: [{ entity: 'User', id: 'u2', values: { name: 'grace' } }],
      })

      expect(isTombstone(other, entityKey('User', 'u1'))).toBe(false)
    })
  })
})
