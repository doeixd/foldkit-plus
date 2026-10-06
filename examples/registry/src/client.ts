/**
 * The browser entry: one device against `pnpm dev`'s server, Remote over HTTP
 * and the journal over its socket; or, built in the `sandbox` mode, the
 * published demo of two devices with the server in the browser.
 */
import { Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Theme } from 'foldkit-mixins/theme'
import { Remote } from 'foldkit-remote'
import { Sync } from 'foldkit-sync'
import { startDevice } from './device.js'

// The theme's tokens, which the grid's default style and the page's chrome
// read: the demos' shared accent and the faint tint of its hue in the greys.
Style.install(
  AppStyle.make({
    palette: Theme.oklch({ accent: { h: 270, c: 0.15, l: '54%' }, surfaceSaturation: 0.004 }),
  }).stylesheet,
)

const container = document.getElementById('app')
if (container === null) throw new Error('index.html has no #app')

const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
if (import.meta.env.MODE === 'sandbox') {
  // The published demo: two devices on one page, the server in the browser.
  const { startSandbox } = await import('./sandbox/client.js')
  await startSandbox(container)
} else {
  // Vite proxies `/remote` and `/sync` to the server, so the browser talks to one origin.
  await startDevice({
    container,
    key: 'foldkit-registry/replica',
    // The name this tab commits as, short enough to read in "replaced by …".
    name: replicaId => `tab-${replicaId.slice(0, 4)}`,
    resources: Remote.clientLayer(Remote.http('/remote')),
    transport: device =>
      Sync.transport.socket({ url: `${protocol}://${location.host}/sync?device=${device}` }),
  })
}
