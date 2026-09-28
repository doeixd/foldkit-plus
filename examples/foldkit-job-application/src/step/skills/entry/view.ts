import { Option } from 'effect'
import { Submodel } from 'foldkit'
import { SlotView, Style } from 'foldkit-mixins'
import { RadioGroup } from 'foldkit-mixins-ui'

import { ProficiencyLevel } from '../../../domain/index.js'
import { ProficiencyStyle, RemoveButtonStyle, StepSlots, StepStyle } from '../../../style.js'
import { Button, Field } from '../../../view/index.js'
import { Message, type Model, ProficiencyRadioGroup, SkillForm } from './entry.js'

const controls = Field.controlsOf(SkillForm.controls)

export const EntryView = SlotView.forMessages<Message>()
  .define(StepSlots, (model: Model, slots, h) => {
    const nameView = Field.input(
      {
        id: `${model.id}-name`,
        label: controls.name.label,
        field: model.form.fields.name,
        onInput: value =>
          Message.GotFormMessage({ message: SkillForm.Message.Changed({ key: 'name', value }) }),
        placeholder: 'e.g. TypeScript, React, Effect-TS',
      },
      h,
    )

    const proficiencyView = h.submodel({
      slotId: model.proficiencyRadioGroup.id,
      model: model.proficiencyRadioGroup,
      view: ProficiencyRadioGroup.view,
      viewInputs: {
        selectedValue: Option.some(model.proficiency),
        options: ProficiencyLevel.all,
        orientation: 'Horizontal',
        ariaLabel: 'Proficiency level',
        // The option is named by its label, which holds the level.
        toView: RadioGroup.toView([ProficiencyStyle.mixin], { h }, ({ group, options }) =>
          h.div(
            group,
            options.map(option => h.div(option.option, [h.span(option.label, [option.value])])),
          ),
        ),
      },
      toParentMessage: message => Message.GotProficiencyRadioGroupMessage({ message }),
    })

    return h.keyed('div')(model.id, slots.entry.attrs(), [
      nameView,
      h.div(slots.control.attrs(), [
        h.span(slots.controlLabel.attrs(), ['Proficiency']),
        proficiencyView,
      ]),
      h.div(slots.entryActions.attrs(), [
        Button.view(
          {
            label: 'Remove skill',
            style: RemoveButtonStyle,
            onClick: Message.ClickedRemoveSelf(),
          },
          h,
        ),
      ]),
    ])
  })
  .pipe(Style.attach(StepStyle))

export const view = Submodel.defineView<Model, Message>(EntryView)
