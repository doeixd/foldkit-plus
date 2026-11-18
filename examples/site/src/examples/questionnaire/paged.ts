import { Questionnaire, QuestionnaireSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { Fields, TRIP_QUESTIONS } from '../../snippets/questionnaire.js'

// One question at a time: `layout: 'paged'` on `init`. Next refuses a missing
// answer and moves the focus to the next question.
export default example({
  title: 'One at a time, in a card',
  slots: QuestionnaireSlots,
  recipe: Recipes.Questionnaire,
  pins: { variant: 'card' },
  state: {
    Model: Questionnaire.Model,
    Message: Questionnaire.Message,
    init: () => ({
      model: Questionnaire.init({
        id: 'questionnaire-paged',
        questions: TRIP_QUESTIONS,
        layout: 'paged',
      }),
    }),
    update: (model, message) => {
      const { model: next, commands } = Questionnaire.update(model, message)
      return { model: next, commands }
    },
  },
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ inlineSize: 'min(28rem, 100%)' })],
      [Questionnaire.view({ model, onMessage, style, ...Fields }, h)],
    ),
})
