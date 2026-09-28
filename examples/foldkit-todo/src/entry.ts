import { BrowserKeyValueStore } from '@effect/platform-browser'
import { Runtime } from 'foldkit'

import { Flags, Message, Model, flags, init, subscriptions, update, view } from './main.js'
import { stylesheet } from './style.js'

const styles = document.createElement('style')
styles.textContent = stylesheet
document.head.append(styles)

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
  resources: BrowserKeyValueStore.layerLocalStorage,
  devTools: {
    Message,
  },
})

Runtime.run(application, { flags })
