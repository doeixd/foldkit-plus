/**
 * The form: the upload field, a submit button, and a receipt that names the
 * files the form submitted.
 */
import { Option } from 'effect'
import { Attr, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { Button, ButtonSlots, FileUpload, FileUploadSlots, Recipes } from 'foldkit-mixins-ui'
import { FORM, Message, NAME, type Model } from './app.js'
import { uploadFormStyle } from './style.js'

export const FileUploadFormSlots = Slots.define({
  form: Slot.make({ capability: Capability.Container }),
  receipt: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
})

export const FieldStyle = Style.forSlots(FileUploadSlots)(
  Recipes.FileUpload({ layout: 'zone', list: 'rows' }),
  { name: 'ShowcaseFileUpload' },
)
export const SubmitStyle = Style.forSlots(ButtonSlots)(Recipes.Button({}), {
  name: 'ShowcaseFileUploadSubmit',
})
export const FormStyle = uploadFormStyle(FileUploadFormSlots)

export const FileUploadForm = SlotView.forMessages<Message>()
  .define(FileUploadFormSlots, (model: Model, slots, h) =>
    h.form(slots.form.attrs([h.Id(FORM), h.OnSubmit(Message.Submitted())]), [
      FileUpload.view(
        {
          model: model.upload,
          onMessage: message => Message.GotUpload({ message }),
          label: 'browse',
          name: NAME,
          description: 'PDFs and images.',
          words: { prompt: 'Drop files here or' },
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
