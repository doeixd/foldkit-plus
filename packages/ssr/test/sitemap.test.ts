/** Phase S4: a sitemap and `robots.txt` from the pages a build generated. */
import { describe, expect, it } from 'vitest'
import { SSR } from 'foldkit-ssr'

const origin = 'https://example.test'

describe('SSR.sitemap', () => {
  it('lists each page once, at its full address, with the day it changed', () => {
    const sitemap = SSR.sitemap(
      [
        { path: '/', modified: '2026-09-27T23:30:00-02:00' },
        { path: '/blog/a&b' },
        { path: '/about', modified: '2026-01-05' },
      ],
      { origin },
    )
    expect(sitemap.split('\n').filter(line => line.includes('<url>'))).toEqual([
      // Late on the 27th two hours west of UTC is the 28th in UTC.
      '  <url><loc>https://example.test/</loc><lastmod>2026-09-28</lastmod></url>',
      '  <url><loc>https://example.test/blog/a&amp;b</loc></url>',
      '  <url><loc>https://example.test/about</loc><lastmod>2026-01-05</lastmod></url>',
    ])
    expect(sitemap).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/)
  })

  it('refuses a relative path, a path given twice, and a date it cannot read', () => {
    expect(() => SSR.sitemap([{ path: 'about' }], { origin })).toThrow(
      '"about" does not start with /',
    )
    expect(() => SSR.sitemap([{ path: '/a' }, { path: '/a' }], { origin })).toThrow(
      '"/a" is listed twice',
    )
    expect(() => SSR.sitemap([{ path: '/a', modified: 'soon' }], { origin })).toThrow(
      '"soon", the date of "/a", is not a date',
    )
  })
})

describe('SSR.robots', () => {
  it('lets crawlers in, keeps them out of what it names, and points to the sitemap', () => {
    expect(SSR.robots({ origin })).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://example.test/sitemap.xml\n',
    )
    expect(SSR.robots({ origin, sitemap: '/pages.xml', disallow: ['/studio'] })).toBe(
      'User-agent: *\nAllow: /\nDisallow: /studio\n\nSitemap: https://example.test/pages.xml\n',
    )
  })
})
