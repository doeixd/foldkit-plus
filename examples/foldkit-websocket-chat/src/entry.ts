import { Runtime } from 'foldkit'
import { Style } from 'foldkit-mixins'

import { runtimeConfig } from './main.js'
import { stylesheet } from './style.js'

Style.install(stylesheet)

const container = document.getElementById('root')
if (container === null) throw new Error('#root is missing from index.html')

Runtime.run(Runtime.makeApplication(runtimeConfig(container)))
