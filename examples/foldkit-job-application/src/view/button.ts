import * as UiButton from '@foldkit/ui/button'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { NamedStyle } from 'foldkit-mixins'
import { Button, type ButtonSlots } from 'foldkit-mixins-ui'

/**
 * An `@foldkit/ui` Button in one of the looks `style.ts` gives buttons. A button
 * with no `onClick` is shown and does nothing, as the one upstream shows while
 * the application is on its way. `input` is what the look reads, if anything.
 */
export const view = <Message>(
  config: Readonly<{
    label: string
    style: NamedStyle<typeof ButtonSlots>
    onClick?: Message
    input?: unknown
  }>,
  h: HtmlBuilder<Message>,
): Html =>
  UiButton.view(
    {
      ...(config.onClick !== undefined && { onClick: config.onClick }),
      toView: attributes =>
        h.button(
          Button.resolve(attributes, [config.style.mixin], { input: config.input, h }).button,
          [config.label],
        ),
    },
    h,
  )
