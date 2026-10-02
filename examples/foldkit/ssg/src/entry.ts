import { Style } from 'foldkit-mixins'
import { FOLDKIT_APP_ATTRIBUTE, SSR } from 'foldkit-ssr/client'

import { Message, Model, init, plan, routing, update, view } from './main.js'
import { stylesheet } from './style.js'

// A page the build rendered carries the stylesheet in its head already, which
// `install` finds and keeps; the dev server's empty page is given it here.
Style.install(stylesheet)

// `#root` is where a page without a server render draws, such as the source
// `index.html` opened without the dev server; a rendered page replaced it with
// the application's own root.
const container =
  document.getElementById('root') ??
  document.querySelector<HTMLElement>(`[${FOLDKIT_APP_ATTRIBUTE}]`)
if (container === null) throw new Error('the page has no #root and no rendered application')

// No `Flags`: the browser starts from the Model the page carries, not from
// `init`. The build's id is the deployment `FOLDKIT_BUILD_ID` named, compiled
// into this bundle and into the server entry by the `foldkit` Vite plugin.
SSR.hydrate({ Model, init, update, view, container, routing, devTools: { Message } }, plan, {
  buildId: import.meta.env.FOLDKIT_BUILD_ID,
})
