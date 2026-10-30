/**
 * The browser's entry: the server's page taken over by Foldkit's runtime,
 * starting from the Model the page carries.
 */
import { FOLDKIT_APP_ATTRIBUTE, SSR } from 'foldkit-ssr/client'
import { Message, Model, init, plan, routing, subscriptions, update } from './app.js'
import { view } from './view.js'

// The theme and the served classes are in the page's head
// (`server/entry.ts`); classes drawn later are added as they appear.
const container = document.querySelector<HTMLElement>(`[${FOLDKIT_APP_ATTRIBUTE}]`)
if (container === null)
  throw new Error('the page was not rendered by the server: start it with `pnpm dev`')

SSR.hydrate(
  { Model, init, update, view, subscriptions, container, routing, devTools: { Message } },
  plan,
  { buildId: import.meta.env.FOLDKIT_BUILD_ID },
)
