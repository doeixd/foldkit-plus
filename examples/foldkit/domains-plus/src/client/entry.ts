/**
 * The browser's entry: the server's page taken over by Foldkit's runtime,
 * starting from the Model the page carries.
 */
import { Remote } from 'foldkit-remote'
import { FOLDKIT_APP_ATTRIBUTE, SSR } from 'foldkit-ssr/client'
import { MAX_BODY_BYTES, MAX_IDS_PER_READ } from '../shared/entity'
import { Message, Model, init, plan, routing, subscriptions, update } from './app.js'
import { view } from './view.js'
// DevTools, kept in the build as upstream ships them; its SSR build skips the
// plugin's own injection, so the overlay is imported here.
import 'virtual:foldkit-devtools-overlay'

// The theme and the served classes are in the page's head
// (`server/entry.ts`); classes drawn later are added as they appear.
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
    routing,
    // The server's own bounds, so a read is cut to what it accepts.
    resources: Remote.clientLayer(Remote.http('/remote'), {
      maxIdsPerEntity: MAX_IDS_PER_READ,
      maxBodyBytes: MAX_BODY_BYTES,
    }),
    devTools: {
      Message,
      show: 'Always',
      mode: 'Inspect',
      banner:
        'Built with Foldkit and Foldkit Plus. Select a Message to inspect its Model, Commands, and Mounts while the app stays live.',
    },
  },
  plan,
  { buildId: import.meta.env.FOLDKIT_BUILD_ID },
)
