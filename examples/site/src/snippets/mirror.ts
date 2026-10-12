import { Mirror } from 'foldkit-mirror'

import { App } from './app.js'

// ?filter=active: the URL carries the filter, and a link restores it. The Model
// still owns it; the URL only mirrors it.
export const Filters = Mirror.url(App, {
  name: 'filters',
  fields: [App.model.filter],
})
