import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Command, CommandSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { note, stack } from '../../snippets/layout.js'

const Model = Schema.Struct({
  query: Schema.String,
  active: Schema.Option(Schema.String),
  ran: Schema.Option(Schema.String),
})
const Message = defineMessageUnion({
  Typed: { query: Schema.String },
  Moved: { value: Schema.String },
  Ran: { value: Schema.String },
})

// The wording and hints every palette of the application starts from, and a
// named preset over them. The query, the highlight and what a row does stay
// the application's, at each use.
const AppPalette = Command.configure({
  base: {
    placeholder: 'Type a command or search',
    empty: 'Nothing matches',
    hints: [
      { keys: ['↑', '↓'], label: 'to move' },
      { keys: ['↵'], label: 'to run' },
    ],
  },
  presets: { files: { placeholder: 'Find a file', empty: 'No such file' } },
})

const groups = [
  {
    heading: 'Files',
    items: [
      { value: 'readme', label: 'README.md' },
      { value: 'changelog', label: 'CHANGELOG.md', keywords: ['history'] },
    ],
  },
]

export default example({
  title: 'Configure once',
  slots: CommandSlots,
  recipe: Recipes.Command,
  state: {
    Model,
    Message,
    init: () => ({ model: { query: '', active: Option.none(), ran: Option.none() } }),
    update: (model, message) => ({
      model: Message.match(message, {
        Typed: ({ query }) => ({ ...model, query }),
        Moved: ({ value }) => ({ ...model, active: Option.some(value) }),
        Ran: ({ value }) => ({ ...model, ran: Option.some(value) }),
      }),
    }),
  },
  view: ({ style, model, onMessage, h }) =>
    stack(h, [
      AppPalette.view(
        {
          id: 'files-palette',
          label: 'Search files',
          preset: 'files',
          groups,
          query: model.query,
          onQuery: query => onMessage(Message.Typed({ query })),
          active: model.active,
          onActive: value => onMessage(Message.Moved({ value })),
          onRun: value => onMessage(Message.Ran({ value })),
          style,
        },
        h,
      ),
      note(h, [
        Option.match(model.ran, { onNone: () => 'Nothing run yet', onSome: v => `Ran ${v}` }),
      ]),
    ]),
})
