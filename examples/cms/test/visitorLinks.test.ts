// @vitest-environment jsdom
/**
 * A visitor's way to the site: Pages offers `Go to the site`, as Posts does.
 * The shell reads its chair when its module loads, so the address names the
 * chair before the views are imported.
 */
import { describe, expect, it } from 'vitest'
import { Inert } from 'foldkit-mixins/testing'

describe('a visitor’s way to the site', () => {
  it('is offered from Pages as it is from Posts', async () => {
    window.history.replaceState(null, '', '/?as=visitor')
    const { Page } = await import('../src/views/pagesView.js')
    const { Studio } = await import('../src/views/view.js')
    const pagesApp = await import('../src/apps/pageApp.js')
    const postsApp = await import('../src/apps/app.js')
    for (const [name, tree] of [
      ['pages', Inert.draw(Page, pagesApp.initial)],
      ['posts', Inert.draw(Studio, postsApp.initial)],
    ] as const) {
      const [link] = Inert.byLabel(tree, 'Go to the site')
      expect(link, name).toBeDefined()
      expect(Inert.value(link, 'href')).toBe('/site?as=visitor')
    }
    // The views pull in the editors and the page Builder; importing them takes
    // a while beside the rest of the suite.
  }, 30_000)
})
