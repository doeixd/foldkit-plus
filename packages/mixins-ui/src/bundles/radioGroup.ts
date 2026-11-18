import * as UiRadioGroup from '@foldkit/ui/radioGroup'
import { Bundle } from 'foldkit-bundle'

const bound: UiRadioGroup.Bundle = UiRadioGroup.create()

/**
 * A RadioGroup's interaction state for `foldkit-bundle`: the focus cursor,
 * with `id` as the arg. The chosen value is the application's: answer the
 * `Selected` OutMessage in `onOut` and give it back as `RadioGroup.view`'s
 * `value`. It holds no view.
 */
export const RadioGroup = Bundle.fromParts('RadioGroup', {
  Model: UiRadioGroup.Model,
  Message: UiRadioGroup.Message,
  init: (args: UiRadioGroup.InitConfig) => UiRadioGroup.init(args),
  parts: { update: bound.update },
})
