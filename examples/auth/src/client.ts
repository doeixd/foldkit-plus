/**
 * The browser entry: the application on Foldkit's runtime, with Remote over
 * HTTP and Yielded's client as its services. Both talk to this page's own
 * origin, which Vite proxies to the server, so the session cookie rides along.
 */
import { Layer } from 'effect'
import * as Runtime from 'foldkit/runtime'
import { Remote } from 'foldkit-remote'
import { AppClient, Model, initial, subscriptions, update } from './app.js'
import { view } from './view.js'

const container = document.getElementById('app')
if (container === null) throw new Error('index.html has no #app')

Runtime.run(
  Runtime.makeElement({
    Model,
    container,
    init: () => ({ model: initial }),
    update,
    view,
    subscriptions,
    resources: Layer.mergeAll(
      // A cookie authorizes these reads only beside Yielded's CSRF header.
      Remote.clientLayer(
        Remote.httpWithLive('/remote', { headers: () => ({ 'x-effect-auth-csrf': '1' }) }),
      ),
      // Its only failure is a `baseUrl` that is not a URL, which `location.origin` is.
      AppClient.layerFetch.pipe(Layer.orDie),
    ),
  }),
)
