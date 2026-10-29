/**
 * The browser entry: the stylesheet, the sandbox's server, and the
 * application on Foldkit's runtime. Who you are is in the address (`?as=ada`),
 * read once: a different person is a new page. `?reset` starts the sandbox
 * again from the seed.
 */
import { Layer } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { Style } from 'foldkit-mixins'
import * as Runtime from 'foldkit/runtime'
import { init, Message, Model, opening, outbox, subscriptions, update } from './app.js'
import { sandboxRemote } from './server/connection.js'
import { PEOPLE, type Person } from './server/seed.js'
import { stylesheet } from './style.js'
import { view } from './view.js'

Style.install(stylesheet)

const params = new URLSearchParams(window.location.search)
const person: Person = PEOPLE.find(each => each === params.get('as')) ?? 'you'

/**
 * Whether the address asks for a fresh sandbox: read, and taken out of the
 * address, so a reload after keeps what was written since.
 */
const startsAfresh = (): boolean => {
  if (!params.has('reset')) return false
  const url = new URL(window.location.href)
  url.searchParams.delete('reset')
  window.history.replaceState(window.history.state, '', url)
  return true
}

/**
 * Whether the address asks for the sandbox to refuse writes as a dropped
 * connection would (`?offline`): what a post does then is wait in the
 * outbox, and a reload without it sends what waits.
 */
const offline = params.has('offline')

const container = document.getElementById('app')
if (container === null) throw new Error('#app is missing from index.html')

Runtime.run(
  Runtime.makeApplication({
    Model,
    Flags: Model,
    init,
    update,
    view,
    subscriptions,
    container,
    resources: Layer.merge(
      sandboxRemote(person, startsAfresh(), offline),
      KeyValueStore.layerStorage(() => localStorage),
    ),
    routing: {
      onUrlRequest: request => Message.ClickedLink({ request }),
      onUrlChange: url => Message.ChangedUrl({ url }),
    },
  }),
  // The outbox read back before the first frame: a chirp waiting shows at once.
  { flags: outbox.restore(opening(person)) },
)
