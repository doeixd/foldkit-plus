/**
 * The browser entry: the same applications, on Foldkit's runtime, with the HTTP
 * transport as their `RemoteClient`. `pnpm dev` serves them: the posts at `/`,
 * the pages at `/pages`. Which chair the page sits in is in the address
 * (`?as=wren`), so a reload is a change of chair.
 */
import type { UrlRequest } from 'foldkit/navigation'
import * as Runtime from 'foldkit/runtime'
import type { Url } from 'foldkit/url'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { FOLDKIT_APP_ATTRIBUTE } from 'foldkit-ssr/client'
import * as Site from './apps/siteApp.js'
import * as Studio from './apps/studioApp.js'
import { siteConfig, takesOver } from './content/siteConfig.js'
import { edited } from './server/sandboxKey.js'
import { chairOf, httpClient, remoteClient, type Send } from './server/transport.js'
import { takeOver } from './ssr/sitePlan.js'

/**
 * Whether the address asks for a fresh sandbox (`?reset`): read, and taken out of
 * the address before the application reads it, so a reload after keeps what was
 * written since.
 */
const startsAfresh = (): boolean => {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('reset')) return false
  url.searchParams.delete('reset')
  window.history.replaceState(window.history.state, '', url)
  return true
}

// The foundations' stylesheet is in the HTML (see `vite.config.ts`); a view's own
// Styles arrive as it draws.

/**
 * Where the application is drawn: `#app` in `index.html`, and in a page the
 * build rendered (`prerender.ts`), its application's root, given that id.
 */
const container =
  document.getElementById('app') ??
  document.querySelector<HTMLElement>(`[${FOLDKIT_APP_ATTRIBUTE}]`)
if (container === null) throw new Error('the page has no #app and no rendered application')
container.id = 'app'
const path = window.location.pathname

// The site is read as a visitor unless the address says otherwise; the studio as a writer.
const chair = chairOf(window.location.search, path.startsWith('/site') ? 'visitor' : 'wren')
// Vite proxies `/remote` to the server, so the browser talks to one origin; the
// published demo, built in the `sandbox` mode, runs the server in the page instead.
// The page is drawn while that starts, and what it asks waits for it.
const sandboxed = (): Send => {
  const sandbox = import('./server/browser.js').then(({ openSandbox }) =>
    openSandbox({ fresh: startsAfresh() }),
  )
  return async (asking, request) => (await sandbox)(asking, request)
}
const remote = Remote.clientLayer(
  import.meta.env.MODE === 'sandbox'
    ? remoteClient(sandboxed(), chair)
    : httpClient('/remote', chair),
)

if (path.startsWith('/site')) {
  const config = siteConfig({
    initial: (url: Url) => Site.initial(url),
    resources: remote,
    container,
  })
  // The deployment `FOLDKIT_BUILD_ID` named, compiled into this bundle and
  // into the pages. A page for another reader draws afresh in its place
  // instead of taking stale facts over as live ones.
  takeOver(config, import.meta.env.FOLDKIT_BUILD_ID, page => takesOver(page, chair, edited()))
} else {
  // The studio's two sections share one document and one runtime: moving
  // between them swaps no application, so nothing reloads and nothing refetches.
  const host = document.createElement('div')
  // The runtime refuses a container without an id, and fails before drawing.
  host.id = container.id
  container.replaceWith(host)
  Runtime.run(
    Runtime.makeApplication<Studio.Model, Studio.Message, RemoteClient>({
      Model: Studio.Model,
      container: host,
      init: (url: Url) => Studio.init(url),
      update: Studio.update,
      view: Studio.view,
      routing: {
        onUrlChange: (url: Url) => Studio.Message.UrlChanged({ url }),
        onUrlRequest: (request: UrlRequest) => Studio.Message.UrlRequested({ request }),
      },
      subscriptions: Studio.subscriptions,
      resources: remote,
    }),
  )
}
