/**
 * What the dev server's page head needs beyond `head.ts`: the compiled classes
 * of the page's static regions. The build writes them from the render
 * (`site.ts`); in development the page is made by Foldkit's pipeline with no
 * head of ours, so the head is made from a render of the same address.
 */
import { Match } from 'effect'
import { Style } from 'foldkit-mixins'

import { renderPage } from './entry.server.js'

export const usedStyleAt = async (url: URL): Promise<string> =>
  Match.valueTags(await renderPage(new Request(url)), {
    Rendered: ({ application }) => `<style>${Style.usedIn(application.html)}</style>`,
    Responded: () => '',
  })
