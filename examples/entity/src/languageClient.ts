/**
 * The language page's browser entry: `language.html`, on Foldkit's runtime. It
 * needs no server; SQLite runs in the page.
 */
import * as Runtime from 'foldkit/runtime'
import { Model, initial, update } from './languageApp.js'
import { view } from './languageView.js'

const container = document.getElementById('app')
if (container === null) throw new Error('language.html has no #app')

Runtime.run(Runtime.makeElement({ Model, container, init: initial, update, view }))
