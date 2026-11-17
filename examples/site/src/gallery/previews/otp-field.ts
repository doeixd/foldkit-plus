import { OtpFieldSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('otp-field'),
  OtpFieldSlots,
  Recipes.OtpField,
  (style, live) =>
    Snippet.otpField(
      style,
      live.widgets.code,
      code => live.onWidget(Widgets.Message.TypedCode({ code })),
      live.h,
    ),
  undefined,
  [
    {
      name: 'basic',
      title: 'Basic',
      draw: (style, live) =>
        Snippet.otpField(
          style,
          live.widgets.code,
          code => live.onWidget(Widgets.Message.TypedCode({ code })),
          live.h,
        ),
    },
    {
      name: 'states',
      title: 'Filling, refused, disabled, read only',
      draw: (style, live) =>
        Snippet.otpFieldStates(
          style,
          live.widgets.otpStates,
          (field, code) => live.onWidget(Widgets.Message.TypedStateCode({ field, code })),
          live.h,
        ),
    },
  ],
)
