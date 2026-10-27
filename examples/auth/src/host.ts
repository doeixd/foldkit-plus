/**
 * The whole site behind one fetch handler, as one Worker serves it:
 * Yielded's routes (`/auth/…`), Remote (`/remote`), and every other request a
 * page. A page is handed the reader its reads go through (`PageContext`),
 * made in this process from the same config `/remote` answers with, so a
 * render reads as the request's reader with no HTTP to itself.
 *
 * `pages` is the page handler: Foldkit's `handleRequest` over `page.ts`'s
 * `renderPage`, which in a Worker is the `fetch.js` a build emits. The
 * board's socket is an upgrade, which a fetch handler does not answer;
 * `http.ts` takes it to `sync`.
 */
import { PageContext } from './page.js'
import { openServer } from './server.js'

/** What answers a page request: Foldkit's fetch handler, or nothing where another server draws the pages. */
export interface Pages {
  readonly fetch: (request: Request) => Promise<Response>
}

export const openHost = async (origin: string, pages: Pages) => {
  const server = await openServer(origin)
  return {
    fetch: (request: Request): Promise<Response> => {
      const path = new URL(request.url).pathname
      if (path.startsWith('/auth/')) return server.auth(request)
      if (path === '/remote') return server.remote(request, undefined)
      return pages.fetch(PageContext.attach(request, { reader: server.read(request, undefined) }))
    },
    sync: server.sync,
    close: server.close,
  }
}
