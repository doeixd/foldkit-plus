/**
 * Ties a control to its label, description, and error with ids derived from
 * one base id: `<id>`, `<id>-label`, `<id>-description`, `<id>-error`. The
 * control gets `aria-labelledby`, `aria-describedby` (description first,
 * then the error while one shows), `aria-invalid`, and `aria-required`. The
 * ids are derived, not minted, so a resumed page and a test agree on them.
 */
import type { HtmlBuilder } from 'foldkit/html'
import * as Behavior from '../behavior.js'
import * as Capability from '../capability.js'

export interface Options<Input, Slots> {
  readonly control: keyof Slots & string
  readonly label: keyof Slots & string
  readonly description?: keyof Slots & string
  readonly error?: keyof Slots & string
  readonly id: (input: Input) => string
  /** The error slot is rendered and describes the control. */
  readonly invalid?: (input: Input) => boolean
  readonly required?: (input: Input) => boolean
}

/** The ids one base id yields, for a view that renders these elements itself. */
export const ids = (id: string) => ({
  control: id,
  label: `${id}-label`,
  description: `${id}-description`,
  error: `${id}-error`,
})

export const behavior =
  <Slots>(slots: Slots) =>
  <Input, Message>(options: Options<Input, Slots>): Behavior.NamedBehavior<Slots, Input, Message> =>
    Behavior.forSlots(slots)<Input, Message>(
      {
        [options.control]: Behavior.slot({
          requires: { capability: Capability.Interactive },
          attributes: ({
            input,
            h,
          }: {
            readonly input: Input
            readonly h: HtmlBuilder<Message>
          }) => {
            const names = ids(options.id(input))
            const invalid = options.invalid?.(input) === true
            const describedBy = [
              ...(options.description === undefined ? [] : [names.description]),
              ...(options.error !== undefined && invalid ? [names.error] : []),
            ]
            return [
              h.Id(names.control),
              h.AriaLabelledBy(names.label),
              ...(describedBy.length === 0 ? [] : [h.AriaDescribedBy(describedBy.join(' '))]),
              ...(invalid ? [h.AriaInvalid(true)] : []),
              ...(options.required?.(input) === true ? [h.AriaRequired(true)] : []),
            ]
          },
        }),
        [options.label]: Behavior.slot({
          attributes: ({
            input,
            h,
          }: {
            readonly input: Input
            readonly h: HtmlBuilder<Message>
          }) => {
            const names = ids(options.id(input))
            return [h.Id(names.label), h.For(names.control)]
          },
        }),
        ...(options.description === undefined
          ? {}
          : {
              [options.description]: Behavior.slot({
                attributes: ({
                  input,
                  h,
                }: {
                  readonly input: Input
                  readonly h: HtmlBuilder<Message>
                }) => [h.Id(ids(options.id(input)).description)],
              }),
            }),
        ...(options.error === undefined
          ? {}
          : {
              [options.error]: Behavior.slot({
                attributes: ({
                  input,
                  h,
                }: {
                  readonly input: Input
                  readonly h: HtmlBuilder<Message>
                }) => [h.Id(ids(options.id(input)).error)],
              }),
            }),
        // Keyed by values the caller chose; `forSlots` checks the keys exist.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, Message>,
      { name: 'FieldAssociation' },
    )
