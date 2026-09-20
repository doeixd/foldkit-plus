/**
 * The browser entry: the same application, on Foldkit's runtime, with the HTTP
 * transport as its `RemoteClient`. `pnpm dev` serves it. Which chair the page
 * sits in is in the address (`?as=wren`), so a reload is a change of chair.
 */
import * as Runtime from 'foldkit/runtime'
import { Remote } from 'foldkit-remote'
import { Model, initial, placements, update } from './app.js'
import { chairOf, httpClient } from './transport.js'
import { view } from './view.js'

const container = document.getElementById('app')
if (container === null) throw new Error('index.html has no #app')

Runtime.run(
  Runtime.makeElement(
    placements.complete({
      Model,
      container,
      init: () => ({ model: initial }),
      update,
      view,
      subscriptions: placements.subscriptions(),
      // Vite proxies `/remote` to the server, so the browser talks to one origin.
      resources: Remote.clientLayer(httpClient('/remote', chairOf(window.location.search))),
    }),
  ),
)
