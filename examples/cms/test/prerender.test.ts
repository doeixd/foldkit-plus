/**
 * The site rendered at build time from the seed: every published page and
 * post, each with its text, its metadata and what the browser takes over.
 */
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { ORIGIN } from '../src/content/domain.js'
import { generateSite, siteTemplate, type Generated } from '../src/ssr/prerender.js'

const template = siteTemplate(readFileSync(new URL('../index.html', import.meta.url), 'utf8'))

let pages: ReadonlyArray<Generated> = []
beforeAll(async () => {
  pages = await generateSite(template)
}, 60_000)

const at = (path: string) => {
  const page = pages.find(each => each.path === path)
  if (page === undefined) throw new Error(`nothing generated at ${path}`)
  return page.html
}

describe('the generated site', () => {
  it('writes each published page and post where a static host serves its address', () => {
    expect(pages.map(page => page.file)).toEqual(
      expect.arrayContaining([
        'site.html',
        'site/about.html',
        'site/blog.html',
        'site/blog/a-page-is-data.html',
        'site/blog/forms-that-know-what-they-submit.html',
      ]),
    )
    expect(pages.filter(page => page.path.startsWith('/site/blog/'))).toHaveLength(8)
  })

  it('puts a post’s text, description and article facts in its HTML', () => {
    const html = at('/site/blog/a-page-is-data')
    expect(html).toContain('<title>A page is data · Journal</title>')
    expect(html).toContain('A page builder that stores HTML has already lost.')
    expect(html).toMatch(
      /<meta data-foldkit-meta name="description" content="This page is not HTML\./,
    )
    expect(html).toContain('<meta data-foldkit-meta property="og:type" content="article">')
    expect(html).toContain('"@type":"BlogPosting"')
    expect(html).toContain(
      '<link rel="canonical" href="https://foldkit-cms-demo.pages.dev/site/blog/a-page-is-data"',
    )
    // Styled before any script, and indexable, unlike the studio.
    expect(html).toMatch(/<style>[^<]*\.style-/)
    expect(html).not.toContain('noindex')
  })

  it('reads what a page’s Blocks read, known only once the page is read', () => {
    const html = at('/site')
    expect(html).toContain('A blog that explains itself')
    // The latest posts, read by the home page's list Block.
    expect(html).toContain('Admin screens, joined not generated')
  })

  it('lists every page in the sitemap, each with a date it can read', () => {
    const sitemap = SSR.sitemap(pages, { origin: ORIGIN })
    expect(sitemap).toContain(
      '<loc>https://foldkit-cms-demo.pages.dev/site/blog/a-page-is-data</loc>',
    )
    expect(sitemap.match(/<lastmod>/g)).toHaveLength(pages.length)
  })
})
