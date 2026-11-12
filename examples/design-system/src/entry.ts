import { Effect } from 'effect'
import { Calendar, Runtime } from 'foldkit'
import { href } from 'virtual:foldkit-styles'

import { Message, Model, initModel, update, view } from './main.js'
import { subscriptions } from './subscriptions.js'

// Page tokens, palette, reset, body defaults and every class the Styles compile
// to, as one hashed file (`foldkit-mixins/vite`). The page loads no style
// compiler: `style.ts` ships as data.
const sheet = document.createElement('link')
sheet.rel = 'stylesheet'
sheet.href = href
document.head.append(sheet)

const container = document.getElementById('root')
if (container === null) throw new Error('#root is missing from index.html')

// The picker's month; tests pass their own fixed date to initModel.
const today = Effect.runSync(Calendar.today.local)

Runtime.run(
  Runtime.makeApplication({
    Model,
    init: () => ({ model: initModel(today) }),
    update,
    view,
    subscriptions,
    container,
    devTools: { Message },
  }),
)
