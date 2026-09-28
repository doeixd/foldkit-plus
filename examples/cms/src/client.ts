/**
 * The browser entry: the same applications, on Foldkit's runtime, with the HTTP
 * transport as their `RemoteClient`. `pnpm dev` serves them: the posts at `/`,
 * the pages at `/pages`. Which chair the page sits in is in the address
 * (`?as=wren`), so a reload is a change of chair.
 */
import type { UrlRequest } from 'foldkit/navigation'
import { Option } from 'effect'
import * as Runtime from 'foldkit/runtime'
import type { Url } from 'foldkit/url'
import { Remote } from 'foldkit-remote'
import * as Posts from './apps/app.js'
import * as Pages from './apps/pageApp.js'
import * as Site from './apps/siteApp.js'
import { APP_ROOT, siteConfig, takesOver } from './content/siteConfig.js'
import { view as pagesView } from './views/pagesView.js'
import { edited } from './server/sandboxKey.js'
import { keepScroll } from './routing/scroll.js'
import { mountStudio } from './apps/studio.js'
import { chairOf, httpSend, remoteClient, type Send } from './server/transport.js'
import { view as postsView } from './views/view.js'

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

type Section = 'posts' | 'pages'
// The site is read as a visitor unless the address says otherwise; the studio as a writer.
const chair = chairOf(window.location.search, path.startsWith('/site') ? 'visitor' : 'wren')
const remote = Remote.clientLayer(remoteClient(send, chair))

if (path.startsWith('/site')) {
  const config = siteConfig({ init: (url: Url) => Site.initial(url), resources: remote, container })
  if (takesOver(document, chair, edited()))
    // The build's id is its entry script's address, which the page loads as this
    // module. Should the takeover's code not load, the page is drawn afresh.
    void import('./ssr/sitePlan.js').then(
      ({ takeOver }) => takeOver(config, new URL(import.meta.url).pathname),
      () => Runtime.run(Runtime.makeApplication(config)),
    )
  else Runtime.run(Runtime.makeApplication(config))
} else {
  // The studio's two sections share one document (`studio.ts`).
  const sectionOf = (pathname: string): Option.Option<Section> =>
    pathname === '/'
      ? Option.some('posts')
      : pathname.startsWith('/pages')
        ? Option.some('pages')
        : Option.none()
  const programOf = (section: Section, at: HTMLElement) =>
    section === 'pages'
      ? Runtime.makeApplication(
          Pages.placements.complete({
            Model: Pages.Model,
            container: at,
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
        )
      : Runtime.makeApplication(
          Posts.placements.complete({
            Model: Posts.Model,
            container: at,
            // The address names the post open and how the list is narrowed.
            init: (url: Url) => Posts.init(url),
            update: Posts.update,
            view: postsView,
            routing: {
              onUrlChange: (url: Url) => Posts.Message.UrlChanged({ url }),
              onUrlRequest: (request: UrlRequest) => Posts.Message.UrlRequested({ request }),
            },
            subscriptions: Posts.placements.subscriptions(Posts.address),
            resources: remote,
          }),
        )

  // The studio keeps a host of its own for the sections to be drawn in.
  const host = document.createElement('div')
  container.replaceWith(host)
  mountStudio({
    host,
    sectionOf,
    initial: Option.getOrElse(sectionOf(path), (): Section => 'posts'),
    mount: (section, at) => {
      const handle = Runtime.embed(programOf(section, at))
      return () => handle.dispose()
    },
    // Another chair is another transport, so it is still a full load.
    sameReader: url => chairOf(url.search) === chair,
  })
}
