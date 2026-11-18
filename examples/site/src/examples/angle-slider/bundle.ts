import { AngleSlider, AngleSliderSlots, Bundles, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// The steps and marks are data, stated once: they are the Bundle's args (so
// `update` folds with them) and the view's options (so it draws them). The
// angle is the dial's own value, read from the placed Model.
const Layout = {
  step: 15,
  marks: [{ value: 0, label: 'N' }, { value: 90, label: 'E' }, { value: 180 }, { value: 270 }],
}

export default example({
  title: 'A bundle with its layout',
  slots: AngleSliderSlots,
  recipe: Recipes.AngleSlider,
  state: Bundles.AngleSlider.with({ id: 'bearing', value: 90, ...Layout }),
  view: ({ style, model, onMessage, h }) =>
    AngleSlider.view({ model, onMessage, label: 'Bearing', ...Layout, style }, h),
})
