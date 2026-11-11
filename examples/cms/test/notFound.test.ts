// @vitest-environment jsdom
/**
 * The 404 page the build emits for a host to serve at an unknown address:
 * the site's own chrome and styles, said to be missing, linking home, not
 * indexed, not in the sitemap, and static: nothing in it for a client to
 * take over.
 */
import { Effect } from 'effect'
import { generateStaticSite } from 'foldkit-ssr/vite'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import source from '../index.html?raw'
import { site } from '../src/ssr/siteBuild.js'

// What the production build adds to the shell: the preloads for the sandbox's code and wasm.
const built = source.replace(
  '</head>',
  '<link rel="modulepreload" href="/browser.js" /><link rel="preload" as="fetch" href="/sql.wasm" /></head>',
)

let emitted: ReadonlyArray<{ file: string; contents: Uint8Array | string }> = []
let sitemap = ''
beforeAll(async () => {
  vi.stubEnv('FOLDKIT_BUILD_ID', 'test-build')
  const made = await Effect.runPromise(
    generateStaticSite({ ...site, template: site.template(built) }),
  )
  vi.unstubAllEnvs()
  emitted = made.emitted
  sitemap = made.sitemap ?? ''
}, 60_000)

const page = () => {
  const found = emitted.find(each => each.file === '404.html')
  if (found === undefined) throw new Error('no 404.html was emitted')
  return new DOMParser().parseFromString(String(found.contents), 'text/html')
}

describe('the 404 page', () => {
  it('is the only file emitted, beside the pages', () => {
    expect(emitted.map(each => each.file)).toEqual(['404.html'])
  })

  it('says it is not found, and asks not to be indexed', () => {
    const document = page()
    expect(document.title).toBe('Not found · Journal')
    expect(document.querySelector('main')?.textContent).toContain(
      'There is no page at this address.',
    )
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex')
  })

  it('links home, inside the site’s own chrome and styles', () => {
    const document = page()
    const home = [...document.querySelectorAll('main a')].find(
      link => link.textContent === 'Go to the home page',
    )
    expect(home?.getAttribute('href')).toBe('/site')
    expect(document.querySelector('header nav[aria-label="Site"]')).not.toBeNull()
    expect(document.querySelector('footer')).not.toBeNull()
    expect(document.head.textContent).toMatch(/\.style-/)
  })

  it('holds nothing for a client to take over or to point at another address', () => {
    const document = page()
    expect(document.querySelector('script')).toBeNull()
    expect(document.querySelector('link[rel$="preload"]')).toBeNull()
    expect(document.querySelector('[data-foldkit-plus-resume], [data-foldkit-app]')).toBeNull()
    expect(document.querySelector('link[rel="canonical"], meta[property="og:url"]')).toBeNull()
  })

  it('is not in the sitemap', () => {
    expect(sitemap).toContain('<loc>https://foldkit-cms-demo.pages.dev/site/blog')
    expect(sitemap).not.toMatch(/404|not-found/)
  })
})
