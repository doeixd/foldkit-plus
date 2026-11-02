/**
 * The browser's entry: the server's page taken over by Foldkit's runtime,
 * starting from the Model the page carries.
 */
import { Layer } from 'effect'
import { Resource } from 'foldkit-bundle'
import { Remote } from 'foldkit-remote'
import { FOLDKIT_APP_ATTRIBUTE, SSR } from 'foldkit-ssr/client'
import { MAX_BODY_BYTES, MAX_IDS_PER_READ } from '../shared/entity'
import { Message, Model, init, plan, routing, subscriptions, update } from './app.js'
import { Sheets } from './sheets.js'
import { view } from './view.js'

// The theme and the served classes come in the page's root
// (`server/entry.ts`), which `SSR.hydrate` moves into the head; classes drawn
// later are added as they appear.
const container = document.querySelector<HTMLElement>(`[${FOLDKIT_APP_ATTRIBUTE}]`)
if (container === null)
  throw new Error('the page was not rendered by the server: start it with `pnpm dev`')

// DevTools load in development only. `import.meta.env.DEV` is false in
// `vite build`, so Vite drops the overlay import and the `devTools` option, and
// the production bundle carries neither.
if (import.meta.env.DEV) await import('virtual:foldkit-devtools-overlay')

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
    resources: Layer.mergeAll(
      Remote.clientLayer(Remote.http('/remote'), {
        maxIdsPerEntity: MAX_IDS_PER_READ,
        maxBodyBytes: MAX_BODY_BYTES,
      }),
      // The cart's and the phone's sheets, a chunk of their own.
      Resource.lazy(Sheets, () => import('./sheetViews.js').then(chunk => chunk.layer)),
    ),
    ...(import.meta.env.DEV
      ? {
          devTools: {
            Message,
            show: 'Always' as const,
            mode: 'Inspect' as const,
            banner:
              'Built with Foldkit and Foldkit Plus. Select a Message to inspect its Model, Commands, and Mounts while the app stays live.',
          },
        }
      : {}),
  },
  plan,
  { buildId: import.meta.env.FOLDKIT_BUILD_ID },
)
