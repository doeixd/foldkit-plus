import { BrowserKeyValueStore } from '@effect/platform-browser'
import { Runtime } from 'foldkit'
import { Style } from 'foldkit-mixins'

import { Flags, Message, Model, flags, routed, subscriptions, view } from './main.js'
import { stylesheet } from './style.js'

Style.install(stylesheet)

const container = document.getElementById('root')
if (container === null) throw new Error('#root is missing from index.html')

const application = Runtime.makeApplication({
  Model,
  Flags,
  ...routed,
  view,
  subscriptions,
  container,
  resources: BrowserKeyValueStore.layerLocalStorage,
  devTools: {
    Message,
  },
})

Runtime.run(application, { flags })
