import { Breakpoints } from 'foldkit-primitives/media'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

// Mobile-first thresholds: the name is the largest whose width is at or below the window's.
export default primitiveExample({
  title: 'Breakpoints',
  text: '`Breakpoints` reports the window’s width and the named breakpoint it falls in, from a table you pass. Resize the window.',
  state: Breakpoints.with({ breakpoints: { phone: 0, tablet: 640, desktop: 1024 } }),
  view: ({ model, h }) =>
    h.p(
      [],
      [`${Math.round(model.width)} pixels wide: ${model.breakpoint ?? 'below every breakpoint'}.`],
    ),
})
