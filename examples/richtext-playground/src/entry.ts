import { Runtime } from 'foldkit'

import { Message, Model, init, update } from './app.js'
import { view } from './view.js'

const container = document.getElementById('root')
if (container === null) throw new Error('#root is missing from index.html')

Runtime.run(
  Runtime.makeApplication({
    Model,
    init,
    update,
    view,
    container,
    devTools: { Message },
  }),
)
