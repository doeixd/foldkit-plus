/** `Marquee.selected`: the ids a lasso touches, or after what was selected when the press was additive. */
import { expect, it } from 'vitest'
import { Marquee } from '../src/interaction/index.js'

it.each([
  { additive: false, before: ['a', 'b'], ids: ['c', 'b'], selected: ['c', 'b'] },
  { additive: true, before: ['a', 'b'], ids: ['c', 'b', 'd'], selected: ['a', 'b', 'c', 'd'] },
  { additive: true, before: [], ids: ['c'], selected: ['c'] },
])(
  'additive $additive: $before with $ids selects $selected',
  ({ additive, before, ids, selected }) => {
    expect(Marquee.selected(before, { ids, additive })).toEqual(selected)
  },
)
