// @vitest-environment node
/**
 * A row is as fresh as its oldest field: a write of one field leaves the row
 * due when the others are, while the newest write still dates its order.
 */
import { noKept } from '../src/kept.js'
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { initialRemoteModel } from '../src/model.js'
import { RemotePersistence } from '../src/persistence.js'
import { visibleStore } from '../src/optimistic.js'
import { deadlineOf, plan } from '../src/plan.js'
import type { Requirement } from '../src/requirement.js'
import { restoreRemote } from '../src/resume.js'
import { entityKey, writeEntity, type EntityStore } from '../src/store.js'

const key = entityKey('Post', 'p1')
const read: Requirement = { entity: 'Post', id: 'p1', fields: ['title', 'likes'] }
const FRESHNESS = 100

/** Both fields read at 0, then `likes` alone written at 50. */
const partly = (): EntityStore =>
  writeEntity(writeEntity({}, key, { title: 'Hi', likes: 1 }, 0), key, { likes: 2 }, 50)

describe('the two dates', () => {
  it('a write of some fields keeps the oldest date, and moves the newest', () => {
    expect(partly()[key]).toMatchObject({ updatedAt: 50, oldestAt: 0 })
  })

  it('a write of every held field dates the row anew', () => {
    const whole = writeEntity(partly(), key, { title: 'Hi', likes: 3 }, 70)
    expect(whole[key]).toMatchObject({ updatedAt: 70, oldestAt: 70 })
  })

  it('a first write dates the row, and so does a write over a tombstone', () => {
    expect(writeEntity({}, key, { likes: 1 }, 30)[key]).toMatchObject({ oldestAt: 30 })
    const absent: EntityStore = {
      [key]: { ...partly()[key]!, tombstone: true, present: new Set(), oldestAt: 0 },
    }
    expect(writeEntity(absent, key, { likes: 1 }, 30)[key]).toMatchObject({ oldestAt: 30 })
  })
})

describe('plan and deadlineOf', () => {
  it('read a row again when its oldest field is due, though another was written since', () => {
    // At 120 the title is 120 old and `likes` 70: the row is due.
    expect(plan(partly(), [read], { freshness: { now: 120, freshness: FRESHNESS } })).toEqual([
      read,
    ])
    expect(deadlineOf(partly(), [read], { now: 60, freshness: FRESHNESS })?.at).toBe(FRESHNESS)
  })

  it('leave a row read whole since alone', () => {
    const whole = writeEntity(partly(), key, { title: 'Hi', likes: 3 }, 50)
    expect(plan(whole, [read], { freshness: { now: 120, freshness: FRESHNESS } })).toEqual([])
    expect(deadlineOf(whole, [read], { now: 60, freshness: FRESHNESS })?.at).toBe(150)
  })
})

/** What a page reads of a row another screen read more of (#512). */
describe('a row held with more fields than a read asks', () => {
  const title: Requirement = { entity: 'Post', id: 'p1', fields: ['title'] }
  const due = { now: 120, freshness: FRESHNESS }
  /** Both fields read at 0; the page reading `title` alone read it again at 120. */
  const reread = (): EntityStore => writeEntity(partly0(), key, { title: 'Hi' }, 120)
  const partly0 = (): EntityStore => writeEntity({}, key, { title: 'Hi', likes: 1 }, 0)

  it('is read again for the fields asked, which then date it for that read', () => {
    expect(plan(partly0(), [title], { freshness: due })).toEqual([title])
    expect(plan(reread(), [title], { freshness: { now: 130, freshness: FRESHNESS } })).toEqual([])
    expect(deadlineOf(reread(), [title], { now: 130, freshness: FRESHNESS })?.at).toBe(220)
  })

  it('stays due for a field nothing has read again', () => {
    expect(plan(reread(), [read], { freshness: { now: 130, freshness: FRESHNESS } })).toEqual([
      read,
    ])
    expect(reread()[key]).toMatchObject({ updatedAt: 120, oldestAt: 0 })
  })

  it('keeps each field its own date through a field written later', () => {
    const later = writeEntity(reread(), key, { likes: 2 }, 150)
    // `title` is 40 old, `likes` 0: neither is due, and the next deadline is the title's.
    expect(plan(later, [read], { freshness: { now: 160, freshness: FRESHNESS } })).toEqual([])
    expect(deadlineOf(later, [read], { now: 160, freshness: FRESHNESS })?.at).toBe(220)
  })

  it('reads a field named like an Object.prototype key by its own date', () => {
    const odd: Requirement = { entity: 'Post', id: 'p1', fields: ['constructor'] }
    const held = writeEntity(
      writeEntity({}, key, { title: 'Hi' }, 0),
      key,
      { constructor: 'c' },
      90,
    )
    expect(plan(held, [odd], { freshness: due })).toEqual([])
    expect(plan(held, [title], { freshness: due })).toEqual([title])
  })
})

describe('a pending write', () => {
  it('leaves the row as fresh as the server last made it, though it covers every field', () => {
    const visible = visibleStore(
      partly(),
      {
        layers: [
          {
            id: 'm1',
            patches: [{ entity: 'Post', id: 'p1', values: { title: 'Ho', likes: 9 } }],
            deletes: [],
            viewer: Option.none(),
          },
        ],
        overlays: [],
      },
      noKept,
    )
    expect(visible[key]).toMatchObject({ values: { title: 'Ho', likes: 9 }, oldestAt: 0 })
    expect(plan(visible, [read], { freshness: { now: 120, freshness: FRESHNESS } })).toEqual([read])
  })
  it('keeps the date of each field under it', () => {
    const visible = visibleStore(
      partly(),
      {
        layers: [
          {
            id: 'm1',
            patches: [{ entity: 'Post', id: 'p1', values: { likes: 9 } }],
            deletes: [],
            viewer: Option.none(),
          },
        ],
        overlays: [],
      },
      noKept,
    )
    // `likes` was read at 50, so at 120 it is fresh though the row's oldest field is not.
    const likes: Requirement = { entity: 'Post', id: 'p1', fields: ['likes'] }
    expect(plan(visible, [likes], { freshness: { now: 120, freshness: FRESHNESS } })).toEqual([])
  })
})

describe('persistence and resume', () => {
  it('keep a row until its oldest field is as old as maxAge', () => {
    const snapshot = RemotePersistence.snapshotOf(
      { ...initialRemoteModel, entities: partly() },
      { maxAge: 1_000 },
    )
    expect(snapshot.expires.rows[key]).toBe(1_000)
    // Reached by a read, the same.
    const reached = RemotePersistence.snapshotOf(
      {
        ...initialRemoteModel,
        entities: partly(),
        recent: { active: { requirements: [read], connections: [] }, departed: [] },
      },
      { maxAge: 1_000 },
    )
    expect(reached.expires.rows[key]).toBe(1_000)
  })

  it('read a capture an older server wrote, without oldestAt, as its updatedAt', () => {
    const restored = restoreRemote(initialRemoteModel, {
      entities: {
        [key]: {
          values: { likes: 2 },
          present: ['likes'],
          stale: [],
          unavailable: [],
          windows: {},
          tombstone: false,
          updatedAt: 50,
        },
      },
      connections: {},
      live: {},
    })
    expect(restored.entities[key]).toMatchObject({ updatedAt: 50, oldestAt: 50 })
  })
})
