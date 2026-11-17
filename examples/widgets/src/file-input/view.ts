/**
 * The form: the file field, a submit button, and a receipt that names the
 * files the form submitted.
 */
import { Option } from 'effect'
import { Attr, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { Button, ButtonSlots, FileInput, FileInputSlots, Recipes } from 'foldkit-mixins-ui'
import { FIELD, FORM, Message, NAME, type Model } from './app.js'
import { fileFormStyle } from './style.js'

export const FileFormSlots = Slots.define({
  form: Slot.make({ capability: Capability.Container }),
  receipt: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
})

export const FieldStyle = Style.forSlots(FileInputSlots)(Recipes.FileInput({}), {
  name: 'ShowcaseFileInput',
})
export const SubmitStyle = Style.forSlots(ButtonSlots)(Recipes.Button({}), {
  name: 'ShowcaseFileSubmit',
})
export const FormStyle = fileFormStyle(FileFormSlots)

export const FileForm = SlotView.forMessages<Message>()
  .define(FileFormSlots, (model: Model, slots, h) =>
    h.form(slots.form.attrs([h.Id(FORM), h.OnSubmit(Message.Submitted())]), [
      FileInput.view(
        {
          id: FIELD,
          label: 'Attach a resume',
          name: NAME,
          multiple: true,
          files: model.files,
          onChange: files => Message.Picked({ files }),
          onRemove: file => Message.Removed({ file }),
          style: FieldStyle,
        },
        h,
      ),
      Button.view({ label: 'Submit', type: 'submit', style: SubmitStyle }, h),
      // Drawn always, so the region is in place before it speaks.
      h.p(
        slots.receipt.attrs([h.Role('status')]),
        Option.match(model.receipt, {
          onNone: () => [],
          onSome: names => [
            names.length === 0 ? 'Submitted no files' : `Submitted ${names.join(', ')}`,
          ],
        }),
      ),
    ]),
  )
  .pipe(Style.attach(FormStyle))
