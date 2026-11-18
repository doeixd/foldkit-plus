/**
 * What the questionnaire examples share: the trip questions and the looks of
 * the widgets a questionnaire draws its questions with.
 */
import {
  ButtonSlots,
  CheckboxGroupSlots,
  InputSlots,
  Questionnaire,
  RadioGroupSlots,
  Recipes,
  TextareaSlots,
} from 'foldkit-mixins-ui'
import { forSlots } from './theme.js'

export const TRIP_QUESTIONS: ReadonlyArray<Questionnaire.Question> = [
  Questionnaire.single({
    id: 'pace',
    prompt: 'How busy should the days be?',
    options: [
      { value: 'slow', label: 'Slow', description: 'One thing a day' },
      { value: 'full', label: 'Full', description: 'Morning to night' },
    ],
    other: 'Something else',
  }),
  Questionnaire.multiple({
    id: 'likes',
    prompt: 'What do you enjoy?',
    options: [
      { value: 'food', label: 'Food' },
      { value: 'museums', label: 'Museums' },
      { value: 'walks', label: 'Walks' },
    ],
  }),
  Questionnaire.text({ id: 'avoid', prompt: 'Anything to avoid?', optional: true }),
]

export const Fields = {
  radioGroup: forSlots(RadioGroupSlots)(Recipes.RadioGroup({})),
  checkboxGroup: forSlots(CheckboxGroupSlots)(Recipes.CheckboxGroup({})),
  input: forSlots(InputSlots)(Recipes.Input({})),
  textarea: forSlots(TextareaSlots)(Recipes.Textarea({})),
  button: forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral', variant: 'outline' })),
  submitButton: forSlots(ButtonSlots)(Recipes.Button({})),
}
