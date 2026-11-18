import { Questionnaire, QuestionnaireSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { Fields, TRIP_QUESTIONS } from '../../snippets/questionnaire.js'

// Every question at once. The Model is `Questionnaire.init`, folded by
// `Questionnaire.update`, whose `OutMessage.Answered` carries every answer
// once the form is sent. Each kind draws with the look of the widget it
// reuses, passed beside the questionnaire's own.
export default example({
  title: 'All at once',
  slots: QuestionnaireSlots,
  recipe: Recipes.Questionnaire,
  state: {
    Model: Questionnaire.Model,
    Message: Questionnaire.Message,
    init: () => ({
      model: Questionnaire.init({ id: 'questionnaire-basic', questions: TRIP_QUESTIONS }),
    }),
    update: (model, message) => {
      const { model: next, commands } = Questionnaire.update(model, message)
      return { model: next, commands }
    },
  },
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ inlineSize: 'min(28rem, 100%)' })],
      [
        Questionnaire.view(
          {
            model,
            onMessage,
            title: 'A few questions before I plan',
            style,
            ...Fields,
          },
          h,
        ),
      ],
    ),
})
