import type { NamedStyle } from 'foldkit-mixins'
import { PasswordInputSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const passwordBasic = <Message>(
  style: NamedStyle<typeof PasswordInputSlots>,
  live: Live<Message>,
) =>
  Snippet.passwordInput(
    style,
    {
      value: live.widgets.password,
      visible: live.widgets.passwordShown,
      onInput: value => live.onWidget(Widgets.Message.TypedPassword({ value })),
      onToggle: live.onWidget(Widgets.Message.ToggledPassword()),
    },
    live.h,
  )

export const showcase = fromRecipe(
  about('password-input'),
  PasswordInputSlots,
  Recipes.PasswordInput,
  passwordBasic,
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: passwordBasic },
    {
      name: 'new',
      title: 'A new password',
      draw: (style, live) =>
        Snippet.passwordInputNew(
          style,
          {
            value: live.widgets.newPassword,
            visible: live.widgets.newPasswordShown,
            capsLock: live.widgets.capsLock,
            onInput: value => live.onWidget(Widgets.Message.TypedNewPassword({ value })),
            onToggle: live.onWidget(Widgets.Message.ToggledNewPassword()),
            onCapsLock: reading => live.onWidget(Widgets.Message.ReadCapsLock({ reading })),
          },
          live.h,
        ),
    },
  ],
)
