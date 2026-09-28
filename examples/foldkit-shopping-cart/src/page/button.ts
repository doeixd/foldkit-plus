import * as UiButton from '@foldkit/ui/button'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinValue } from 'foldkit-mixins'
import { Button } from 'foldkit-mixins-ui'

/** A `@foldkit/ui` Button with a text label, sending `message` on click, styled by `style`. */
export const buttonView = <Message>(
  label: string,
  message: Message,
  style: MixinValue<never>,
  h: HtmlBuilder<Message>,
): Html =>
  UiButton.view(
    {
      onClick: message,
      toView: attributes =>
        h.button(
          Button.resolve<undefined, Message>(attributes, [style], { input: undefined, h }).button,
          [label],
        ),
    },
    h,
  )
