/**
 * The browser entry. Remote posts to this origin's `/remote`, which Pages
 * forwards to the Worker. The actor header is read per request, so renaming
 * it applies on the next call.
 */
import * as Runtime from 'foldkit/runtime'
import { Remote } from 'foldkit-remote'
import { ACTOR_KEY, applyCache, initial, Model, placements, subscriptions, update } from './app.js'
import { view } from './view.js'

const container = document.getElementById('app')
if (container === null) throw new Error('index.html has no #app')

const stored = sessionStorage.getItem(ACTOR_KEY)
const actor = stored === null || stored.trim().length === 0 ? 'anon' : stored
sessionStorage.setItem(ACTOR_KEY, actor)

Runtime.run(
  Runtime.makeElement(
    placements.runtime({
      Model,
      container,
      initial: () => ({ model: applyCache(initial(actor)) }),
      update,
      view,
      subscriptions,
      resources: Remote.clientLayer(
        Remote.httpWithLive('/remote', {
          headers: () => {
            const name = sessionStorage.getItem(ACTOR_KEY)
            return { 'x-actor': name === null || name.trim().length === 0 ? 'anon' : name }
          },
        }),
      ),
    }),
  ),
)
