import { FOLDKIT_APP_ATTRIBUTE, SSR } from 'foldkit-ssr/client'

import { Message, Model, init, plan, routing, update, view } from './main.js'
import { STYLESHEET_ATTRIBUTE, stylesheet } from './style.js'

// A page the build rendered carries the stylesheet in its head already.
if (document.querySelector(`style[${STYLESHEET_ATTRIBUTE}]`) === null) {
  const styles = document.createElement('style')
  styles.setAttribute(STYLESHEET_ATTRIBUTE, '')
  styles.textContent = stylesheet
  document.head.append(styles)
}

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
