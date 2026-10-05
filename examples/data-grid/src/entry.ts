import { Runtime } from 'foldkit'
import { Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Theme } from 'foldkit-mixins/theme'

import { Message, Model, init, update, view } from './main.js'

// The theme's tokens, which the grid's default style reads.
Style.install(
  AppStyle.make({
    palette: Theme.oklch({ accent: { h: 270, c: 0.15, l: '54%' }, surfaceSaturation: 0.004 }),
  }).stylesheet,
)

const container = document.getElementById('root')
if (container === null) throw new Error('#root is missing from index.html')

Runtime.run(
  Runtime.makeApplication({
    Model,
    init: () => init(),
    update,
    view,
    container,
    devTools: { Message },
  }),
)
