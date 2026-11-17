import type { Html, HtmlBuilder } from 'foldkit/html'
import type { NamedStyle } from 'foldkit-mixins'
import { Recipes, TextareaSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'
import type { Live } from '../showcase.js'

const noteSnippets = {
  grow: Snippet.textareaGrow,
  count: Snippet.textareaCount,
  reply: Snippet.textareaFooter,
} as const

/**
 * A textarea in a column of its own: one that grows with its text takes its
 * width from the text too where nothing gives it one, as the centring stage does not.
 */
const textareaColumn = <Message>(h: HtmlBuilder<Message>, field: Html) =>
  h.div([h.Style({ inlineSize: 'min(100%, 24rem)' })], [field])

/** A textarea example drawn over the text the widgets keep for it. */
const textareaNote = <Message>(
  style: NamedStyle<typeof TextareaSlots>,
  live: Live<Message>,
  example: Widgets.NotesExample,
) =>
  textareaColumn(
    live.h,
    noteSnippets[example](
      style,
      {
        value: live.widgets.notes[example],
        onType: value => live.onWidget(Widgets.Message.TypedNote({ example, value })),
      },
      live.h,
    ),
  )

export const showcase = fromRecipe(
  about('textarea'),
  TextareaSlots,
  Recipes.Textarea,
  style => textareaColumn(inert, Snippet.textarea(style, inert)),
  undefined,
  [
    {
      name: 'grow',
      title: 'Grows with its text',
      draw: (style, live) => textareaNote(style, live, 'grow'),
    },
    {
      name: 'fixed',
      title: 'A fixed height',
      draw: style => Snippet.textareaFixed(style, inert),
      pins: { resize: 'vertical' },
    },
    {
      name: 'count',
      title: 'A character count',
      draw: (style, live) => textareaNote(style, live, 'count'),
    },
    {
      name: 'footer',
      title: 'With a footer',
      draw: (style, live) => textareaNote(style, live, 'reply'),
    },
  ],
)
