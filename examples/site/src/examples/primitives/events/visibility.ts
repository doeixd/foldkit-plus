import { Visibility } from 'foldkit-primitives/events'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

// `Changed` arrives on `visibilitychange`: the Model knows when the tab was left.
export default primitiveExample({
  title: 'Visibility',
  text: '`Visibility` keeps whether the page is visible. Switch to another tab and back: a page can pause work while it is hidden.',
  state: Visibility,
  view: ({ model, h }) =>
    h.p([], [model.visible ? 'This tab is in front.' : 'This tab is hidden.']),
})
