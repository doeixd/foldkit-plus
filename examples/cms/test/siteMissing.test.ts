/**
 * The public site's missing treatments: a post missed from the blog links
 * back to the blog, a page missed from the home page links back home, and a
 * missing post's title names the miss, not the index.
 */
import { describe, expect, it } from 'vitest'
import { Inert } from 'foldkit-mixins/testing'
import { visit } from './siteFixture.js'

describe('the site’s missing treatments', () => {
  it('misses a post from the blog, titled as missed', async () => {
    const page = await visit('/site/blog/no-such-post')
    expect(page.title).toBe('Not found · Journal')
    const [link] = Inert.byLabel(page.body, 'Go to the blog')
    expect(Inert.value(link, 'href')).toBe('/site/blog')
    expect(Inert.text(page.body)).toContain('There is no post at this address.')
  })

  it('misses a page from the home page', async () => {
    const page = await visit('/site/no-such-page')
    expect(page.title).toBe('Journal')
    const [link] = Inert.byLabel(page.body, 'Go to the home page')
    expect(Inert.value(link, 'href')).toBe('/site')
    expect(Inert.text(page.body)).toContain('There is no page at this address.')
  })
})
