/**
 * The seed is imported by the CMS: each item published as a publish leaves it,
 * and the home page names the featured post by the id its import gave it.
 */
import { Schema } from 'effect'
import { Composition, NodeId } from 'foldkit-composition'
import { describe, expect, it } from 'vitest'
import { openServer } from '../src/server.js'
import { memorySqlite } from '../src/sqlite-node.js'

describe('the seed', () => {
  it('publishes each item through the CMS, and points the home page at its posts', async () => {
    const backend = openServer(() => new Date('2026-03-01T09:00:00.000Z'), memorySqlite())
    await backend.seed()
    expect(
      backend.rows(
        'select type, revision, created_by from cms_entries where archived_at is null order by id',
      ),
    ).toEqual([
      ...Array.from({ length: 2 }, () => ({ type: 'pages', revision: 1, created_by: 'edda' })),
      ...Array.from({ length: 6 }, () => ({ type: 'posts', revision: 1, created_by: 'edda' })),
    ])
    expect(backend.rows('select count(*) as drafts from cms_drafts')).toEqual([{ drafts: 0 }])
    expect(
      backend.rows('select count(*) as unpublished from posts where published_at is null'),
    ).toEqual([{ unpublished: 0 }])
    const [featured] = backend.rows(`select id from posts where slug = 'a-page-is-data'`)
    const [home] = backend.rows(`select document from pages where slug = 'home'`)
    const document = Schema.decodeUnknownSync(Composition.Document)(
      JSON.parse(String(home?.document)),
    )
    expect(document.nodes[NodeId.make('feature')]?.props['post']).toBe(featured?.id)
  })
})
