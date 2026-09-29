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
import * as Site from './apps/siteApp.js'
import * as Studio from './apps/studioApp.js'
import { APP_ROOT, siteConfig, takesOver } from './content/siteConfig.js'
import { edited } from './server/sandboxKey.js'
import { keepScroll } from './routing/scroll.js'
import { chairOf, httpSend, remoteClient, type Send } from './server/transport.js'

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
keepScroll()

/**
 * Where the application is drawn: `#app` in `index.html`, and in a page the
 * build rendered (`prerender.ts`), its application's root, given that id.
 */
const container =
  document.getElementById('app') ?? document.querySelector<HTMLElement>(`[${APP_ROOT}]`)
if (container === null) throw new Error('the page has no #app and no rendered application')
container.id = 'app'
// Vite proxies `/remote` to the server, so the browser talks to one origin; the
// published demo, built in the `sandbox` mode, runs the server in the page instead.
// The page is drawn while that starts, and what it asks waits for it.
const send: Send =
  import.meta.env.MODE === 'sandbox'
    ? (() => {
        const sandbox = import('./server/browser.js').then(({ openSandbox }) =>
          openSandbox({ fresh: startsAfresh() }),
        )
        return async (asking, body) => (await sandbox)(asking, body)
      })()
    : httpSend('/remote')
const path = window.location.pathname

// The site is read as a visitor unless the address says otherwise; the studio as a writer.
const chair = chairOf(window.location.search, path.startsWith('/site') ? 'visitor' : 'wren')
const remote = Remote.clientLayer(remoteClient(send, chair))

if (path.startsWith('/site')) {
  const config = siteConfig({
    initial: (url: Url) => Site.initial(url),
    resources: remote,
    container,
  })
  if (takesOver(document, chair, edited()))
    // The build's id is its entry script's address, which the page loads as this
    // module. Should the takeover's code not load, the page is drawn afresh.
    void import('./ssr/sitePlan.js').then(
      ({ takeOver }) => takeOver(config, new URL(import.meta.url).pathname),
      () => Runtime.run(Runtime.makeApplication(config)),
    )
  else Runtime.run(Runtime.makeApplication(config))
} else {
  // The studio's two sections share one document and one runtime: moving
  // between them swaps no application, so nothing reloads and nothing refetches.
  const host = document.createElement('div')
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
