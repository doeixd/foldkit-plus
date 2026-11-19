/**
 * A package's first page took in the sections that were pages of their own
 * (its mental model, install, example); `public/_redirects` sends each old
 * address to the heading it became, and no redirect leads anywhere that is not
 * a page and a heading of the site.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { loadPosts } from '../src/blog/posts.js'
import { allSubsites } from '../src/catalog.js'
import { guidePages } from '../src/content/guides.js'

const repository = fileURLToPath(new URL('../../..', import.meta.url))
const all = readFileSync(new URL('../public/_redirects', import.meta.url), 'utf8')
  .split('\n')
  .filter(line => /^\/\S+ \/\S+ 301$/.test(line))
  .map(line => line.split(' ') as [string, string, string])
const isPost = ([from]: readonly [string, string, string]) => from.startsWith('/blog/')
const rules = all.filter(rule => !isPost(rule))

describe('the renamed posts', () => {
  it('redirect each old address to a post that is there, and no post is redirected away', () => {
    const paths = new Set(loadPosts(repository).map(post => post.path))
    const moved = all.filter(isPost)
    expect(moved.length).toBeGreaterThan(0)
    for (const [from, to] of moved) {
      expect(paths.has(to), `${from} -> ${to}`).toBe(true)
      expect(paths.has(from), `${from} is still a post`).toBe(false)
    }
  })
})

describe('the moved guide pages', () => {
  const pages = guidePages(repository, allSubsites).pages

  it('redirect each old address to a heading of a page that is there', () => {
    expect(rules.length).toBeGreaterThan(50)
    const paths = new Set(pages.map(page => page.path))
    for (const [from, to] of rules) {
      const [path = '', anchor = ''] = to.split('#')
      const page = pages.find(each => each.path === path)
      expect(page, `${from} -> ${to}`).toBeDefined()
      expect(
        page!.anchors.some(each => each.id === anchor),
        `${from} -> ${to}`,
      ).toBe(true)
      expect(paths.has(from), `${from} is still a page`).toBe(false)
    }
  })

  it('leave every package README’s sections reachable: each is a page, or redirects to one', () => {
    const redirected = new Set(rules.map(([from]) => from))
    const first = pages.filter(page => page.first && /^packages\//.test(page.source.file))
    expect(first.length).toBeGreaterThan(40)
    for (const page of first)
      expect(redirected.has(page.path), `${page.path} must not itself move`).toBe(false)
  })
}, 60_000)
