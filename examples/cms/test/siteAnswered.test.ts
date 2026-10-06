/**
 * When the site's drawing is the page and not its loading state: the route's
 * read, and on a page each of its Blocks' reads, have answers. A page the
 * browser draws afresh stays served until then (`sitePlan.ts`).
 */
import { expect, it } from 'vitest'
import { answered } from '../src/apps/siteApp.js'
import { readSite } from './siteFixture.js'

it('waits for the route’s read, and on a page for its Blocks’ reads too', async () => {
  // The home page has Blocks that read the latest posts.
  expect(answered(await readSite('/site', 'none', true))).toBe(false)
  expect(answered(await readSite('/site', 'route', true))).toBe(false)
  expect(answered(await readSite('/site', 'blocks', true))).toBe(true)
  // The blog is its read alone.
  expect(answered(await readSite('/site/blog', 'none'))).toBe(false)
  expect(answered(await readSite('/site/blog', 'route'))).toBe(true)
  // A post that is not there is an answer as well.
  expect(answered(await readSite('/site/blog/nothing-here', 'route'))).toBe(true)
})
