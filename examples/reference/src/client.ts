/**
 * The browser entry: the Worker's page taken over by Foldkit's runtime, with
 * Remote over HTTP (and its live stream) and Yielded's client as services.
 * Both talk to this page's own origin, so the session cookie rides along.
 */
import { Layer } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { Resource } from 'foldkit-plus/bundle'
import { Remote } from 'foldkit-plus/remote'
import { FOLDKIT_APP_ATTRIBUTE, SSR } from 'foldkit-plus/ssr/client'
import {
  AppClient,
  Message,
  Model,
  durable,
  plan,
  subscriptions,
  unreadAt,
  update,
} from './main.js'
import { view } from './view.js'
import { httpWithLive } from 'foldkit-plus/remote/live'

// Every page is rendered by the Worker, and its root is the application's own.
const container = document.querySelector<HTMLElement>(`[${FOLDKIT_APP_ATTRIBUTE}]`)
if (container === null) throw new Error('the page was not rendered by the Worker')

SSR.hydrate(
  {
    Model,
    init: url => ({ model: unreadAt(url) }),
    update,
    view,
    subscriptions,
    container,
    routing: {
      onUrlRequest: request => Message.ClickedLink({ request }),
      onUrlChange: url => Message.ChangedUrl({ url }),
    },
    resources: Layer.mergeAll(
      // A cookie authorizes these calls only beside Yielded's CSRF header.
      Remote.clientLayer(
        httpWithLive('/remote', { headers: () => ({ 'x-effect-auth-csrf': '1' }) }),
      ),
      // Yielded's client, a chunk of its own: loaded by the first sign-in, sign-up or sign-out.
      Resource.lazy(AppClient, () => import('./authClient.js').then(chunk => chunk.layer)),
      // Where the outbox keeps unsent notes, shared by this origin's tabs.
      KeyValueStore.layerStorage(() => localStorage),
    ),
    devTools: { Message },
  },
  plan,
  {
    buildId: import.meta.env.FOLDKIT_BUILD_ID,
    // A session for this page's durable writes, which the view does not draw,
    // so the first client view is still the Worker's page. The queue itself
    // is read after it, by the outbox's own Subscription.
    prepare: durable.session,
  },
)
