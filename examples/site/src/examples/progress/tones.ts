import { Option } from 'effect'
import { Progress, ProgressSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { stack } from '../../snippets/layout.js'

// A tone colours the fill by what the work means: `success` for done,
// `warning` for slow, `danger` for failed. The tone is a recipe selection,
// so each bar is a style of its own.
const Success = Recipes.Progress.style({ tone: 'success' })
const Warning = Recipes.Progress.style({ tone: 'warning' })
const Danger = Recipes.Progress.style({ tone: 'danger' })

export default example({
  title: 'Tones',
  slots: ProgressSlots,
  recipe: Recipes.Progress,
  pins: { shape: 'bar' },
  view: ({ h }) =>
    stack(h, [
      Progress.view(
        { id: 'built', label: 'Built', value: Option.some(100), showValue: true, style: Success },
        h,
      ),
      Progress.view(
        { id: 'tested', label: 'Tests', value: Option.some(40), showValue: true, style: Warning },
        h,
      ),
      Progress.view(
        {
          id: 'deployed',
          label: 'Deploy failed',
          value: Option.some(72),
          showValue: true,
          style: Danger,
        },
        h,
      ),
    ]),
})
