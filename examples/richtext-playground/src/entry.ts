import { Runtime } from 'foldkit'
import { Style } from 'foldkit-mixins'

import { Message, Model, init, update } from './app.js'
import { A } from './style.js'
import { view } from './view.js'

// The page sheet: the layer order, the reset, the tokens and the palette. Each Slot's own CSS
// is injected the first time it is drawn.
Style.install(A.stylesheet)

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
