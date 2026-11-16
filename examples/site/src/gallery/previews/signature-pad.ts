import type { NamedStyle } from 'foldkit-mixins'
import { Recipes, SignaturePadSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const signatureBasic = <Message>(
  style: NamedStyle<typeof SignaturePadSlots>,
  live: Live<Message>,
) =>
  Snippet.signaturePad(
    style,
    live.widgets.signature,
    message => live.onWidget(Widgets.Message.GotSignature({ message })),
    live.h,
  )

export const showcase = fromRecipe(
  about('signature-pad'),
  SignaturePadSlots,
  Recipes.SignaturePad,
  signatureBasic,
  undefined,
  [{ name: 'basic', title: 'Draw or type', draw: signatureBasic }],
)
