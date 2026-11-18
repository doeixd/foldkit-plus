import { AngleSlider, AngleSliderSlots, Bundles, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// Every angle slider of the application steps by fifteen and reads its angle
// aloud the same way, said once; a use gives its Model and its label.
const AppDial = AngleSlider.configure({
  base: { step: 15, words: { degrees: '{value} degrees clockwise from north' } },
})

export default example({
  title: 'Configure once',
  slots: AngleSliderSlots,
  recipe: Recipes.AngleSlider,
  state: Bundles.AngleSlider.with({ id: 'wind', value: 45, step: 15 }),
  view: ({ model, onMessage, h }) => AppDial.view({ model, onMessage, label: 'Wind direction' }, h),
})
