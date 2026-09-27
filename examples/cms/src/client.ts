/**
 * The browser entry: the same applications, on Foldkit's runtime, with the HTTP
 * transport as their `RemoteClient`. `pnpm dev` serves them: the posts at `/`,
 * the pages at `/pages`. Which chair the page sits in is in the address
 * (`?as=wren`), so a reload is a change of chair.
 */
import type { UrlRequest } from 'foldkit/navigation'
import * as Runtime from 'foldkit/runtime'
import type { Url } from 'foldkit/url'
import { Remote } from 'foldkit-remote'
import * as Posts from './app.js'
import * as Pages from './pageApp.js'
import * as Site from './siteApp.js'
import { view as siteView } from './siteView.js'
import { view as pagesView } from './pagesView.js'
import { stylesheet } from './sheet.js'
import { chairOf, httpSend, remoteClient, type Send } from './transport.js'
import { view as postsView } from './view.js'

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

// Compiled once, at module load, from the same Style values the views attach.
const styles = document.createElement('style')
styles.textContent = stylesheet
document.head.append(styles)

const container = document.getElementById('app')
if (container === null) throw new Error('index.html has no #app')
// Vite proxies `/remote` to the server, so the browser talks to one origin; the
// published demo, built in the `sandbox` mode, runs the server in the page instead.
// The page is drawn while that starts, and what it asks waits for it.
const send: Send =
  import.meta.env.MODE === 'sandbox'
    ? (() => {
        const sandbox = import('./browser.js').then(({ openSandbox }) =>
          openSandbox({ fresh: startsAfresh() }),
        )
        return async (asking, body) => (await sandbox)(asking, body)
      })()
    : httpSend('/remote')
const path = window.location.pathname
// The site is read as a visitor unless the address says otherwise; the studio as a writer.
const chair = chairOf(window.location.search, path.startsWith('/site') ? 'visitor' : 'wren')
const remote = Remote.clientLayer(remoteClient(send, chair))

if (path.startsWith('/site'))
  Runtime.run(
    Runtime.makeApplication(
      Site.placements.complete({
        Model: Site.Model,
        container,
        init: (url: Url) => Site.initial(url),
        update: Site.update,
        view: siteView,
        routing: {
          onUrlChange: (url: Url) => Site.Message.UrlChanged({ url }),
          onUrlRequest: (request: UrlRequest) => Site.Message.UrlRequested({ request }),
        },
        subscriptions: Site.placements.subscriptions(),
        resources: remote,
      }),
    ),
  )
else if (path.startsWith('/pages'))
  Runtime.run(
    Runtime.makeApplication(
      Pages.placements.complete({
        Model: Pages.Model,
        container,
        // The address names the page and the Block: opening it is a navigation.
        init: (url: Url) => Pages.update(Pages.initial, Pages.Message.UrlChanged({ url })),
        update: Pages.update,
        view: pagesView,
        routing: {
          onUrlChange: (url: Url) => Pages.Message.UrlChanged({ url }),
          onUrlRequest: (request: UrlRequest) => Pages.Message.UrlRequested({ request }),
        },
        subscriptions: Pages.placements.subscriptions(Pages.address),
        resources: remote,
      }),
    ),
  )
else
  Runtime.run(
    Runtime.makeElement(
      Posts.placements.complete({
        Model: Posts.Model,
        container,
        init: () => ({ model: Posts.initial }),
        update: Posts.update,
        view: postsView,
        subscriptions: Posts.placements.subscriptions(),
        resources: remote,
      }),
    ),
  )
