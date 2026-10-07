import { Runtime } from 'foldkit'
import { Style } from 'foldkit-mixins'

import { Message, Model, initialModel, update, view } from './main.js'
import { stylesheet } from './style.js'
import { subscriptions } from './subscriptions.js'

// Page tokens, palette, reset, and body defaults; every recipe injects its own
// classes when its SlotView first draws them.
Style.install(stylesheet)

const container = document.getElementById('root')
if (container === null) throw new Error('#root is missing from index.html')

Runtime.run(
  Runtime.makeApplication({
    Model,
    init: () => ({ model: initialModel }),
    update,
    view,
    subscriptions,
    container,
    devTools: { Message },
  }),
)
