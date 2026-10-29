/**
 * The plain renderers of the recipes' kinds, for `foldkit-mixins-form`'s
 * `FormView.define(form, { renderers })`, beside its own: each a native input
 * the browser already knows how to edit, named by its key so a post without
 * scripts carries it.
 */
import type { Control } from 'foldkit-form'
import type { Renderer, Renderers, RenderContext } from 'foldkit-mixins-form'
import type { Attribute } from 'foldkit/html'
import { Option } from 'effect'
import { FieldRecipes } from './index.js'
import { readWall } from './wall.js'

const { Kinds } = FieldRecipes

/** A native input of `type`, holding the draft as typed, with what else the kind asks. */
const native =
  <Message>(
    type: string,
    extra: (context: RenderContext<Message>) => ReadonlyArray<Attribute<Message>> = () => [],
  ): Renderer<Message> =>
  context => {
    const { state, draft, change, blurred, slots, h } = context
    return h.input(
      slots.text.attrs([
        ...state,
        h.Type(type),
        h.Value(String(draft)),
        h.OnInput(change),
        h.OnBlur(blurred),
        ...extra(context),
      ]),
    )
  }

/** What the browser may fill in, and that a keyboard must not capitalize or correct it. */
const literal = <Message>(
  { h }: RenderContext<Message>,
  autocomplete: string,
): ReadonlyArray<Attribute<Message>> => [
  h.Attribute('autocomplete', autocomplete),
  h.Attribute('autocapitalize', 'none'),
  h.Attribute('spellcheck', 'false'),
]

/** The data of a control of `kind`, which the table only hands it. */
const dataOf = <Data>(
  kind: { readonly is: (control: Control) => control is Control<Data> },
  control: Control,
): Data => {
  if (!kind.is(control)) throw new Error(`a ${control.kind} control under another kind's renderer`)
  return control.data
}

/**
 * An amount's text input: text, since `"4."` and `"-"` are fine drafts that
 * `type="number"` would refuse to report. Its keypad has a minus only when the
 * amount may be negative (`decimal` has none on iOS), and no point for a whole one.
 */
const amount = <Message>(
  of: (control: Control) => { readonly negative?: boolean | undefined; readonly scale: number },
): Renderer<Message> =>
  native('text', context => {
    const { negative, scale } = of(context.control)
    return [
      context.h.InputMode(negative === true ? 'text' : scale === 0 ? 'numeric' : 'decimal'),
      context.h.Attribute('autocomplete', 'off'),
    ]
  })

/** A renderer for each recipe kind. */
export const renderers = <Message>(): Renderers<Message> => ({
  [Kinds.Date.kind]: native('date'),
  // A date-time input cannot hold a draft with an offset (the later of a repeated
  // hour) or of year 0: it would show nothing, so such a draft is shown as text.
  // It steps by a millisecond, the finest a draft holds: its default minute would
  // offer no seconds, and refuse a value that has them.
  [Kinds.DateTime.kind]: context =>
    context.draft === '' || Option.exists(readWall(String(context.draft)), wall => wall.year > 0)
      ? native<Message>('datetime-local', ({ h }) => [h.Step('0.001')])(context)
      : native<Message>('text')(context),
  [Kinds.Email.kind]: native('email', context =>
    literal(context, dataOf(Kinds.Email, context.control).autocomplete ?? 'email'),
  ),
  [Kinds.Url.kind]: native('url', context =>
    literal(context, dataOf(Kinds.Url, context.control).autocomplete ?? 'url'),
  ),
  [Kinds.Tel.kind]: native('tel', context => [
    context.h.InputMode('tel'),
    context.h.Attribute('autocomplete', dataOf(Kinds.Tel, context.control).autocomplete ?? 'tel'),
  ]),
  [Kinds.Password.kind]: native('password', context =>
    literal(
      context,
      dataOf(Kinds.Password, context.control).purpose === 'new'
        ? 'new-password'
        : 'current-password',
    ),
  ),
  [Kinds.Money.kind]: amount(control => dataOf(Kinds.Money, control)),
  [Kinds.Decimal.kind]: amount(control => dataOf(Kinds.Decimal, control)),
  [Kinds.Percent.kind]: amount(control => {
    const data = dataOf(Kinds.Percent, control)
    return { negative: data.negative, scale: data.scale ?? 2 }
  }),
  // The address before the slug is text beside its input, in the field's affix.
  [Kinds.Slug.kind]: context =>
    context.h.div(context.slots.group.attrs(), [
      context.h.span(context.slots.affix.attrs(), [dataOf(Kinds.Slug, context.control).prefix]),
      native<Message>('text', inner => literal(inner, 'off'))(context),
    ]),
})
