import { Spring, SpringMessage } from 'foldkit-primitives/motion'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

// A target by stiffness and damping, stepped every 16ms on Effect's clock while running.
export default primitiveExample({
  title: 'Spring',
  text: '`Spring` settles a number on its target by stiffness and damping, so it can overshoot where a `Tween` cannot. The view reads `value`.',
  state: Spring.with({ from: 0, to: 100, stiffness: 120, damping: 8 }),
  view: ({ model, onMessage, slots, h }) =>
    h.div(
      [],
      [
        h.div(
          slots.liveBar.attrs([
            h.Style({ '--filled': `${Math.max(0, Math.min(100, model.value))}%` }),
          ]),
          [],
        ),
        h.button(
          slots.liveButton.attrs([h.Type('button'), h.OnClick(onMessage(SpringMessage.Started()))]),
          [model.running ? 'Running' : 'Release'],
        ),
        ` ${Math.round(model.value)}`,
      ],
    ),
})
