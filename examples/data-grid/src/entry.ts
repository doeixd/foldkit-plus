import { Runtime } from 'foldkit'
import { Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Theme } from 'foldkit-mixins/theme'

import { Message, Model, init, savedLayout, update, view } from './main.js'

// The theme's tokens, which the grid's default style reads.
Style.install(
  AppStyle.make({
    theme: Theme.make({
      accent: { hue: 270, chroma: 0.15, lightness: 54 },
      surface: { saturation: 0.004 },
    }),
  }).stylesheet,
)

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
