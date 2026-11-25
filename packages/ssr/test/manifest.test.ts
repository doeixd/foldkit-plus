import { describe, expect, it } from 'vitest'
import { defineManifest, manifestFromChunks } from '../src/vite/manifest.js'

describe('SSR Manifest contract (Phase 7 Bout 7.3)', () => {
  it('accepts a complete manifest where every tag has one home', () => {
    const manifest = defineManifest(['AddDomain', 'RemoveDomain'], {
      AddDomain: { chunk: '/assets/add.js', with: ['/assets/add-cmd.js'] },
      RemoveDomain: { chunk: '/assets/remove.js', with: [] },
    })
    expect(manifest.AddDomain.chunk).toBe('/assets/add.js')
    expect(manifest.RemoveDomain.with).toEqual([])
  })

  it('refuses duplicate tags and missing homes in manifestFromChunks', () => {
    expect(() =>
      manifestFromChunks(
        ['AddDomain', 'RemoveDomain'],
        [
          { chunk: '/assets/a.js', tags: ['AddDomain'] },
          { chunk: '/assets/b.js', tags: ['AddDomain', 'RemoveDomain'] },
        ],
      ),
    ).toThrow(/claimed by both/)

    expect(() =>
      manifestFromChunks(
        ['AddDomain', 'RemoveDomain'],
        [{ chunk: '/assets/a.js', tags: ['AddDomain'] }],
      ),
    ).toThrow(/missing home for tag "RemoveDomain"/)
  })
})
