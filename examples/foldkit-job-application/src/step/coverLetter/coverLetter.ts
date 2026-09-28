import * as UiTextarea from '@foldkit/ui/textarea'
import { Match, Schema } from 'effect'
import { Submodel, type Update } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { SlotView, Style } from 'foldkit-mixins'
import { Textarea } from 'foldkit-mixins-ui'

import {
  CoverLetterSlots,
  CoverLetterStyle,
  type LetterLength,
  TextareaStyle,
} from '../../style.js'

// MODEL

export const Model = Schema.Struct({
  content: Schema.String,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  UpdatedContent: { value: Schema.String },
})

export type Message = typeof Message.Type

// INIT

export const init = (): Model => ({
  content: '',
})

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    UpdatedContent: ({ value }) => ({
      model: modifyFields(model, { content: () => value }),
    }),
  })

// VIEW

const MAX_COVER_LETTER_LENGTH = 2000
const WARNING_THRESHOLD_CHARS = 200

const letterLength = (remaining: number): LetterLength =>
  Match.value(remaining).pipe(
    Match.withReturnType<LetterLength>(),
    Match.when(
      count => count < 0,
      () => 'Over',
    ),
    Match.when(
      count => count <= WARNING_THRESHOLD_CHARS,
      () => 'Nearly',
    ),
    Match.orElse(() => 'Plenty'),
  )

export const CoverLetterView = SlotView.forMessages<Message>()
  .define(CoverLetterSlots, (model: Model, slots, h) => {
    const remaining = MAX_COVER_LETTER_LENGTH - model.content.length
    const length = letterLength(remaining)

    return UiTextarea.view(
      {
        id: 'cover-letter',
        value: model.content,
        onInput: value => Message.UpdatedContent({ value }),
        rows: 12,
        placeholder:
          'Tell us why you want to work on Foldkit and what excites you about the Elm Architecture...',
        isInvalid: length === 'Over',
        toView: attributes => {
          const resolved = Textarea.resolve<undefined, Message>(attributes, [TextareaStyle.mixin], {
            input: undefined,
            h,
          })
          return h.div(slots.letter.attrs(), [
            h.label(resolved.label, ['Cover Letter']),
            // A slot's attributes are typed for every element, and Foldkit's textarea
            // excludes `InnerHTML`; nothing here sets one.
            h.textarea(resolved.textarea as Parameters<typeof h.textarea>[0]),
            h.div(slots.footer.attrs(), [
              h.p(slots.hint.attrs(), ['A strong cover letter helps your application stand out.']),
              h.span(slots.counter.attrs([h.DataAttribute('state', length)]), [
                `${remaining} characters remaining`,
              ]),
            ]),
          ])
        },
      },
      h,
    )
  })
  .pipe(Style.attach(CoverLetterStyle))

export const view = Submodel.defineView<Model, Message>(CoverLetterView)
