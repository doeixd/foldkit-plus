import { Runtime } from 'foldkit'

import { Message, Model, init, update, view } from './main.js'
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
  container,
  devTools: {
    Message,
  },
})

Runtime.run(application)
