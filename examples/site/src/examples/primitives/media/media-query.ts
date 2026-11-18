import { MediaQuery } from 'foldkit-primitives/media'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

// Any query the browser understands: the bundle keeps whether it matches now.
export default primitiveExample({
  title: 'MediaQuery',
  text: '`MediaQuery` keeps whether a query matches, corrected as the browser changes it. This one asks for a pointer that can hover, which a phone has not.',
  state: MediaQuery.with({ query: '(hover: hover) and (pointer: fine)' }),
  view: ({ model, h }) =>
    h.p([], [model.matches ? 'You have a mouse or trackpad.' : 'You are on a touch screen.']),
})
