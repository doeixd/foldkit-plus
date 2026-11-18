/**
 * The form: the topics field, a submit button, and a receipt that lists the
 * tags the form submitted.
 */
import { Option } from 'effect'
import { Attr, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { Button, ButtonSlots, Recipes, TagsInput, TagsInputSlots } from 'foldkit-mixins-ui'
import { FORM, Message, NAME, RECEIPT, type Model } from './app.js'
import { tagsFormStyle } from './style.js'

export const TagsFormSlots = Slots.define({
  form: Slot.make({ capability: Capability.Container }),
  receipt: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
})

export const FieldStyle = Style.forSlots(TagsInputSlots)(Recipes.TagsInput({}), {
  name: 'ShowcaseTagsInput',
})
export const SubmitStyle = Style.forSlots(ButtonSlots)(Recipes.Button({}), {
  name: 'ShowcaseTagsSubmit',
})
export const FormStyle = tagsFormStyle(TagsFormSlots)

export const TagsForm = SlotView.forMessages<Message>()
  .define(TagsFormSlots, (model: Model, slots, h) =>
    h.form(slots.form.attrs([h.Id(FORM), h.OnSubmit(Message.Submitted())]), [
      TagsInput.view(
        {
          model: model.topics,
          onMessage: message => Message.GotTopicsMessage({ message }),
          label: 'Topics',
          placeholder: 'Add a topic',
          name: NAME,
          addOnBlur: true,
          style: FieldStyle,
        },
        h,
      ),
      Button.view({ label: 'Submit', type: 'submit', style: SubmitStyle }, h),
      // Drawn always, so the region is in place before it speaks.
      h.p(
        slots.receipt.attrs([h.Id(RECEIPT), h.Role('status')]),
        Option.match(model.receipt, {
          onNone: () => [],
          onSome: tags => [
            tags.length === 0 ? 'Submitted no topics' : `Submitted ${tags.join(', ')}`,
          ],
        }),
      ),
    ]),
  )
  .pipe(Style.attach(FormStyle))
