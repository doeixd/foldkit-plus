/**
 * The browser entry: the server's page taken over by Foldkit's runtime, with
 * Remote over HTTP and Yielded's client as its services. Both talk to this
 * page's own origin, which Vite proxies to the server, so the session cookie
 * rides along.
 */
import { Layer } from 'effect'
import { Remote } from 'foldkit-remote'
import { FOLDKIT_APP_ATTRIBUTE, SSR } from 'foldkit-ssr/client'
import { AppClient, Message, Model, belief, init, plan, subscriptions, update } from './app.js'
import { view } from './view.js'

// Every page is rendered by the server, and its root is the application's own.
const container = document.querySelector<HTMLElement>(`[${FOLDKIT_APP_ATTRIBUTE}]`)
if (container === null)
  throw new Error('the page was not rendered by the server: start it with `pnpm dev`')

SSR.hydrate(
  {
    Model,
    init,
    update,
    view,
    subscriptions,
    container,
    routing: {
      onUrlRequest: request => Message.ClickedLink({ request }),
      onUrlChange: url => Message.ChangedUrl({ url }),
    },
    resources: Layer.mergeAll(
      // A cookie authorizes these reads only beside Yielded's CSRF header.
      Remote.clientLayer(
        Remote.http('/remote', {
          headers: () => ({ 'x-effect-auth-csrf': '1' }),
          fetch: belief.fetch,
        }),
      ),
      // Its only failure is a `baseUrl` that is not a URL, which `location.origin` is.
      AppClient.layerFetch.pipe(Layer.orDie),
    ),
    devTools: { Message },
  },
  plan,
  { buildId: import.meta.env.FOLDKIT_BUILD_ID },
)
