import { FOLDKIT_APP_ATTRIBUTE } from 'foldkit/experimental/server'
import { SSR } from 'foldkit-ssr'

import { Message, Model, init, plan, update, view } from './main.js'

// Every page is rendered by the server, with the stylesheet in its head, and
// its root is the application's own. (Importing Foldkit's server module for
// the stamp's name costs nothing: `foldkit-ssr` carries it already.)
const container = document.querySelector<HTMLElement>(`[${FOLDKIT_APP_ATTRIBUTE}]`)
if (container === null)
  throw new Error('the page was not rendered by the server: start it with `pnpm dev`')

// No `Flags`: the browser starts from the Model the page carries, not from
// `init`. Built apart from the call, since `SSR.hydrate` declares no
// `devTools`, which it hands to `makeApplication` as they are.
const config = {
  Model,
  init,
  update,
  view,
  container,
  devTools: {
    Message,
  },
}

// The build's id is this script's address, which `entry.server.ts` read from
// the template the page was rendered into.
SSR.hydrate(config, plan, { buildId: new URL(import.meta.url).pathname })
