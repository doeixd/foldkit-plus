import { Runtime } from 'foldkit'
import { Style } from 'foldkit-mixins'

import { Flags, Message, Model, flags, init, subscriptions, update, view } from './main.js'
import { stylesheet } from './style.js'

Style.install(stylesheet)

const container = document.getElementById('root')
if (container === null) throw new Error('#root is missing from index.html')

const application = Runtime.makeApplication({
  Model,
  Flags,
  init,
  update,
  view,
  subscriptions,
  container,
  routing: {
    onUrlRequest: request => Message.ClickedLink({ request }),
    onUrlChange: url => Message.ChangedUrl({ url }),
  },
  devTools: {
    Message,
  },
})

Runtime.run(application, { flags })
