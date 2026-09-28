import { Runtime } from 'foldkit'

import { api } from './data.js'
import { Message, Model, init, subscriptions, update, view } from './main.js'
import { stylesheet } from './style.js'

const styles = document.createElement('style')
styles.textContent = stylesheet
document.head.append(styles)

const container = document.getElementById('root')
if (container === null) throw new Error('#root is missing from index.html')

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  subscriptions,
  container,
  resources: api,
  devTools: {
    Message,
  },
})

Runtime.run(application)
