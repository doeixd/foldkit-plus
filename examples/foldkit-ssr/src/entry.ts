import { Style } from 'foldkit-mixins'
import { FOLDKIT_APP_ATTRIBUTE, SSR } from 'foldkit-ssr/client'

import { Message, Model, init, plan, update, view } from './main.js'
import { stylesheet } from './style.js'

// The page's styles, installed when the runtime boots. A generated page would
// carry them in its head; here the server renders each request, so the script
// brings them.
Style.install(stylesheet)

// Every page is rendered by the server, and its root is the application's own.
const container = document.querySelector<HTMLElement>(`[${FOLDKIT_APP_ATTRIBUTE}]`)
if (container === null)
  throw new Error('the page was not rendered by the server: start it with `pnpm dev`')

// No `Flags`: the browser starts from the Model the page carries, not from
// `init`. The build's id is the deployment `FOLDKIT_BUILD_ID` named, compiled
// into this bundle and into the server entry by the `foldkit` Vite plugin.
SSR.hydrate({ Model, init, update, view, container, devTools: { Message } }, plan, {
  buildId: import.meta.env.FOLDKIT_BUILD_ID,
})
