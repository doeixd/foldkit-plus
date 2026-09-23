/**
 * Phase 5: static generation. The same render as a request's, at build time,
 * for known paths, each as the file a static host serves it from.
 */
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { config as themed, plan as themedPlan } from './flagsFixture.js'
import { template } from './handoverFixture.js'
import { config, plan } from './routeFixture.js'

const generate = (paths: ReadonlyArray<string>) =>
  SSR.generate(config, plan, { buildId: 'b', template, origin: 'https://example.test', paths })

describe('SSR.generate', () => {
  it('renders one page per path, named for the file a static host serves', async () => {
    const pages = await Effect.runPromise(generate(['/', '/about', '/docs/intro/', '/404.html']))
    expect(pages.map(page => [page.path, page.file])).toEqual([
      ['/', 'index.html'],
      ['/about', 'about/index.html'],
      ['/docs/intro/', 'docs/intro/index.html'],
      ['/404.html', '404.html'],
    ])
    expect(pages[1]?.html).toMatch(/<p id="route"[^>]*>\/about<\/p>/)
    expect(pages[1]?.html).toContain('"route":"/about","match":"path"')
    // A trailing slash is the same file, so the path is recorded without it.
    expect(pages[2]?.html).toContain('"route":"/docs/intro","match":"path"')
  })

  it('refuses a path no file can be served at', async () => {
    for (const path of ['/about?tab=2', '/about#team', 'about']) {
      const refused = await Effect.runPromise(Effect.flip(generate([path])))
      expect(refused).toMatchObject({ _tag: 'ResumeUnsafe', reason: 'UngeneratablePath' })
      expect(refused.message).toContain(`"${path}"`)
    }
  })

  it('refuses two paths that would be one file', async () => {
    const refused = await Effect.runPromise(Effect.flip(generate(['/about', '/about/'])))
    expect(refused.message).toBe('"/about" and "/about/" would both be written to about/index.html')
  })

  it('gives each path its own Flags, which never reach the page', async () => {
    const pages = await Effect.runPromise(
      SSR.generate(themed, themedPlan, {
        buildId: 'b',
        template,
        origin: 'https://example.test',
        paths: ['/light', '/dark'],
        flags: path => ({ theme: path.slice(1), secret: 'server-only token' }),
      }),
    )
    expect(pages.map(page => page.html.match(/<p id="theme"[^>]*>(\w+)<\/p>/)?.[1])).toEqual([
      'light',
      'dark',
    ])
    for (const page of pages) expect(page.html).not.toContain('server-only token')
  })
})
