// @vitest-environment node
/**
 * A page pays for what it uses (#378). Pages are bundled against the published
 * `foldkit-entity` and `foldkit-remote`, each built with its own
 * `tsdown.config.ts`, and what each keeps of the two builds is read by module.
 *
 * What a later phase of #378 makes true is an `it.fails` naming the phase: it
 * holds the gap open until the phase lands, and goes red then, to be turned
 * into an `it`.
 */
import { rmSync } from 'node:fs'
import { basename } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildPublished, pageModules, scratchIn } from './pageBuild.js'

/** Declares Entities and reads a Selection of each, with no Remote. */
const declares = `
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'

const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, body: Schema.String }))
const Domain = Entity.defineVariants('Domain', {
  Available: { id: Schema.String, price: Schema.Number },
  Unconfirmed: { id: Schema.String },
})
export const body = Entity.select(Post, { id: true, body: true })
export const domain = Entity.select(Domain, { _tag: true, price: true })
`

const reads = `
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { Remote } from 'foldkit-remote'

const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, body: Schema.String }))
const Model = Schema.Struct({ remote: Remote.Model })
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
export const post = Entity.select(Post, { id: true, body: true })
`

/** A page that reads one Entity with Remote, and writes nothing. */
const readOnly = `${reads}
export const Data = Remote.make({ model: App.model.remote, entities: [Post] })
export const shown = Data.get(post, 'p1')
export const subscriptions = Data.subscriptions
export const reduce = Data.reduce
`

/** The same page with one declared write. */
const writes = `${reads}
import { Mutation } from 'foldkit-remote'
import { Write } from 'foldkit-entity'

const EditPost = Mutation.write(
  'EditPost',
  Write.update(Entity.input(Post, Schema.Struct({ id: Schema.String, body: Schema.String })), {
    id: 'id',
  }),
)
export const Data = Remote.make({ model: App.model.remote, entities: [Post], mutations: [EditPost] })
export const shown = Data.get(post, 'p1')
export const subscriptions = Data.subscriptions
export const reduce = Data.reduce
export const edit = Data.mutate
`

/** The modules of each build a page keeps code of, by file name. */
interface Kept {
  readonly entity: ReadonlyArray<string>
  readonly remote: ReadonlyArray<string>
}

const none: Kept = { entity: [], remote: [] }
const kept = { declares: none, readOnly: none, writes: none }
const made: Array<string> = []

beforeAll(async () => {
  const entityRoot = scratchIn('entity', 'read-only-')
  // The pages are built here too, so they resolve Remote's own dependencies.
  const remoteRoot = scratchIn('remote', 'read-only-')
  made.push(entityRoot, remoteRoot)
  const entityEntry = await buildPublished('entity', entityRoot)
  const remoteEntry = await buildPublished('remote', remoteRoot)
  const keptBy = async (page: string): Promise<Kept> => {
    const modules = await pageModules(remoteRoot, page, [
      { find: /^foldkit-entity$/, replacement: entityEntry },
      { find: /^foldkit-remote$/, replacement: remoteEntry },
    ])
    const under = (entry: string) => {
      const dir = entry.replaceAll('\\', '/').replace(/[^/]+$/, '')
      return (
        modules
          .filter(({ id, length }) => id.startsWith(dir) && length > 0)
          // A module in an import cycle is emitted as a shared chunk named after
          // one of them with a hash (`why-B1AUOttp.js`): read it by that name.
          .map(({ id }) => basename(id).replace(/-[\w-]{8}\.js$/, '.js'))
      )
    }
    return { entity: under(entityEntry), remote: under(remoteEntry) }
  }
  kept.declares = await keptBy(declares)
  kept.readOnly = await keptBy(readOnly)
  kept.writes = await keptBy(writes)
}, 300_000)

afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

describe('a page that declares Entities and reads a Selection', () => {
  it('keeps the declarations', () => {
    expect(kept.declares.entity).toContain('variants.js')
  })

  it('keeps no invariant judge, expressions or writes (#378 phase 3)', () => {
    const heavy = /^(invariant|evaluate|operators|expr|write)\.js$/
    expect(kept.declares.entity.filter(name => heavy.test(name))).toEqual([])
  })
})

describe('a read-only Remote page', () => {
  it('keeps what reading needs', () => {
    expect(kept.readOnly.remote).toEqual(
      expect.arrayContaining(['index.js', 'model.js', 'plan.js', 'store.js']),
    )
  })

  it('keeps no explanations (#378 phase 2)', () => {
    expect(kept.readOnly.remote).not.toContain('why.js')
    expect(kept.readOnly.remote).not.toContain('whyReasons.js')
  })

  it('keeps no write code (#378 phase 4b)', () => {
    expect(kept.readOnly.remote).not.toContain('mutation.js')
    expect(kept.readOnly.remote).not.toContain('mutationDescriptor.js')
    expect(kept.readOnly.remote).not.toContain('writes.js')
  })

  it('keeps no layer code (#378 phases 4 and 5)', () => {
    expect(kept.readOnly.remote).not.toContain('layers.js')
    expect(kept.readOnly.remote).not.toContain('optimistic.js')
    expect(kept.readOnly.entity).not.toContain('write.js')
  })

  it('keeps no outbox or persistence code (#378 phase 5)', () => {
    expect(kept.readOnly.remote).not.toContain('outbox.js')
    expect(kept.readOnly.remote).not.toContain('outboxStore.js')
    expect(kept.readOnly.remote).not.toContain('persistence.js')
  })

  it('keeps no live code (#378 phase 5)', () => {
    expect(kept.readOnly.remote).not.toContain('live.js')
    expect(kept.readOnly.remote).not.toContain('liveReads.js')
    expect(kept.readOnly.remote).not.toContain('liveEvents.js')
    expect(kept.readOnly.remote).not.toContain('sse.js')
  })

  it('keeps no expression evaluator (#378 phases 4 and 5)', () => {
    expect(kept.readOnly.entity).not.toContain('evaluate.js')
  })
})

describe('a Remote page that writes', () => {
  it('keeps the write code', () => {
    expect(kept.writes.remote).toEqual(
      expect.arrayContaining(['mutation.js', 'writes.js', 'layers.js', 'optimistic.js']),
    )
    expect(kept.writes.entity).toContain('write.js')
  })
})
