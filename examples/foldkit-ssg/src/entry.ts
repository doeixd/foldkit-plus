import { Style } from 'foldkit-mixins'
import { FOLDKIT_APP_ATTRIBUTE, SSR } from 'foldkit-ssr/client'

import { Message, Model, init, plan, routing, update, view } from './main.js'
import { stylesheet } from './style.js'

// A page the build rendered carries the stylesheet in its head already, which
// `install` finds and keeps; the dev server's empty page is given it here.
Style.install(stylesheet)

// `#root` is where the dev server's empty page draws; a page the build rendered
// replaced it with the application's own root.
const container =
  document.getElementById('root') ??
  document.querySelector<HTMLElement>(`[${FOLDKIT_APP_ATTRIBUTE}]`)
if (container === null) throw new Error('the page has no #root and no rendered application')

// The build's id is this script's address, which `entry.server.ts` read from
// the template the page was rendered into.
SSR.hydrate({ Model, init, update, view, container, routing, devTools: { Message } }, plan, {
  buildId: new URL(import.meta.url).pathname,
})
