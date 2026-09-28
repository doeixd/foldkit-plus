import { FOLDKIT_APP_ATTRIBUTE } from 'foldkit/experimental/server'
import { type UrlRequest } from 'foldkit/navigation'
import { type Url } from 'foldkit/url'
import { SSR } from 'foldkit-ssr'

import { Message, Model, init, plan, update, view } from './main.js'
import { STYLESHEET_ATTRIBUTE, stylesheet } from './style.js'

// A page the build rendered carries the stylesheet in its head already.
if (document.querySelector(`style[${STYLESHEET_ATTRIBUTE}]`) === null) {
  const styles = document.createElement('style')
  styles.setAttribute(STYLESHEET_ATTRIBUTE, '')
  styles.textContent = stylesheet
  document.head.append(styles)
}

// `#root` is where the dev server's empty page draws; a page the build rendered
// replaced it with the application's own root. (Importing Foldkit's server
// module for the stamp's name costs nothing: `foldkit-ssr` carries it already.)
const container =
  document.getElementById('root') ??
  document.querySelector<HTMLElement>(`[${FOLDKIT_APP_ATTRIBUTE}]`)
if (container === null) throw new Error('the page has no #root and no rendered application')

// Built apart from the call: `SSR.hydrate` declares `routing` as `unknown` and
// no `devTools`, which it hands to `makeApplication` as they are.
const config = {
  Model,
  init,
  update,
  view,
  container,
  routing: {
    onUrlRequest: (request: UrlRequest) => Message.ClickedLink({ request }),
    onUrlChange: (url: Url) => Message.ChangedUrl({ url }),
  },
  devTools: {
    Message,
  },
}

// The build's id is this script's address, which `entry.server.ts` read from
// the template the page was rendered into.
SSR.hydrate(config, plan, { buildId: new URL(import.meta.url).pathname })
