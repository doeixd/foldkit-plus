/**
 * The browser entry: the application on Foldkit's runtime, with the HTTP
 * transport as its `RemoteClient`. `pnpm dev` serves it.
 */
import * as Runtime from 'foldkit/runtime'
import { Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Theme } from 'foldkit-mixins/theme'
import { Remote } from 'foldkit-remote'
import { Model, initial, placements, update } from './app.js'
import { httpClient } from './transport.js'
import { view } from './view.js'

// The theme's tokens, which the grid's default style reads.
Style.install(
  AppStyle.make({ palette: Theme.oklch({ accent: { h: 250, c: 0.12, l: '55%' } }) }).stylesheet,
)

const container = document.getElementById('app')
if (container === null) throw new Error('index.html has no #app')

Runtime.run(
  Runtime.makeElement(
    placements.runtime({
      Model,
      container,
      initial: () => ({ model: initial() }),
      update,
      view,
      // Vite proxies `/remote` to the server, so the browser talks to one origin.
      resources: Remote.clientLayer(httpClient('/remote')),
    }),
  ),
)
