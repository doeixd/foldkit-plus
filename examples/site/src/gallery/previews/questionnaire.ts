import type { NamedStyle } from 'foldkit-mixins'
import { Recipes, QuestionnaireSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const tripAll = <Message>(style: NamedStyle<typeof QuestionnaireSlots>, live: Live<Message>) =>
  Snippet.questionnaire(
    style,
    live.widgets.tripQuestions,
    message => live.onWidget(Widgets.Message.GotTripQuestions({ message })),
    live.h,
  )

export const showcase = fromRecipe(
  about('questionnaire'),
  QuestionnaireSlots,
  Recipes.Questionnaire,
  tripAll,
  undefined,
  [
    { name: 'basic', title: 'All at once', draw: tripAll },
    {
      name: 'paged',
      title: 'One at a time, in a card',
      pins: { variant: 'card' },
      draw: (style, live) =>
        Snippet.questionnairePaged(
          style,
          live.widgets.tripQuestionsPaged,
          message => live.onWidget(Widgets.Message.GotTripQuestionsPaged({ message })),
          live.h,
        ),
    },
  ],
)
