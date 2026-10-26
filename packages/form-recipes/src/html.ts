/**
 * The plain renderers of the recipes' kinds, for `foldkit-mixins-form`'s
 * `FormView.define(form, { renderers })`, beside its own: each a native input
 * the browser already knows how to edit, named by its key so a post without
 * scripts carries it.
 */
import type { Renderer, Renderers, RenderContext } from 'foldkit-mixins-form'
import { FieldRecipes } from './index.js'

/** A native input of `type`, holding the draft as typed. */
const native =
  <Message>(type: string): Renderer<Message> =>
  ({ state, draft, change, blurred, slots, h }: RenderContext<Message>) =>
    h.input(
      slots.text.attrs([
        ...state,
        h.Type(type),
        h.Value(String(draft)),
        h.OnInput(change),
        h.OnBlur(blurred),
      ]),
    )

/** A renderer for each recipe kind. */
export const renderers = <Message>(): Renderers<Message> => ({
  [FieldRecipes.Kinds.Date.kind]: native('date'),
  [FieldRecipes.Kinds.DateTime.kind]: native('datetime-local'),
})
