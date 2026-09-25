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
import { view as pagesView } from './pagesView.js'
import { stylesheet } from './sheet.js'
import { chairOf, httpClient } from './transport.js'
import { view as postsView } from './view.js'

// Compiled once, at module load, from the same Style values the views attach.
const styles = document.createElement('style')
styles.textContent = stylesheet
document.head.append(styles)

const container = document.getElementById('app')
if (container === null) throw new Error('index.html has no #app')
// Vite proxies `/remote` to the server, so the browser talks to one origin.
const remote = Remote.clientLayer(httpClient('/remote', chairOf(window.location.search)))

if (window.location.pathname.startsWith('/pages'))
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
