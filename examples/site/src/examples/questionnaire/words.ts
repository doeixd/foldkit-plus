import { Questionnaire, QuestionnaireSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { Fields, TRIP_QUESTIONS } from '../../snippets/questionnaire.js'

// Every fixed text is a word, with `{blanks}` where a number goes: the
// buttons, what a missing answer says, and where the reader is.
export default example({
  title: 'In another language',
  slots: QuestionnaireSlots,
  recipe: Recipes.Questionnaire,
  pins: { variant: 'card' },
  state: {
    Model: Questionnaire.Model,
    Message: Questionnaire.Message,
    init: () => ({
      model: Questionnaire.init({
        id: 'questionnaire-words',
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
      [
        Questionnaire.view(
          {
            model,
            onMessage,
            style,
            ...Fields,
            words: {
              submit: 'Senden',
              next: 'Weiter',
              back: 'Zurück',
              missing: 'Bitte antworten',
              skipped: 'Übersprungen',
              progress: 'Frage {page} von {total}',
            },
          },
          h,
        ),
      ],
    ),
})
