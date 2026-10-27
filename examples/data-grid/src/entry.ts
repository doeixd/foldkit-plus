import { Runtime } from 'foldkit'
import { Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'

import { Message, Model, init, savedLayout, update, view } from './main.js'

// The theme's tokens, which the grid's default style reads.
Style.install(AppStyle.make({}).stylesheet)

const container = document.getElementById('root')
if (container === null) throw new Error('#root is missing from index.html')

Runtime.run(
  Runtime.makeApplication({
    Model,
    init: () => init(100_000, savedLayout()),
    update,
    view,
    container,
    devTools: { Message },
  }),
)
