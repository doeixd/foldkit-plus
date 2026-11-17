import type { NamedStyle } from 'foldkit-mixins'
import { CommandSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const commandBasic = <Message>(style: NamedStyle<typeof CommandSlots>, live: Live<Message>) =>
  Snippet.command(
    style,
    {
      query: live.widgets.commandQuery,
      active: live.widgets.commandActive,
      ran: live.widgets.commandRan,
    },
    {
      onQuery: query => live.onWidget(Widgets.Message.TypedCommand({ query })),
      onActive: value => live.onWidget(Widgets.Message.HighlightedCommand({ value })),
      onRun: value => live.onWidget(Widgets.Message.RanCommand({ value })),
    },
    live.h,
  )

export const showcase = fromRecipe(
  about('command'),
  CommandSlots,
  Recipes.Command,
  commandBasic,
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: commandBasic },
    {
      name: 'dialog',
      title: 'In a dialog (⌘K)',
      draw: (style, live) =>
        Snippet.commandDialog(
          style,
          {
            dialog: live.widgets.palette,
            query: live.widgets.paletteQuery,
            active: live.widgets.paletteActive,
            pages: live.widgets.palettePages,
            ran: live.widgets.paletteRan,
          },
          {
            onOpen: live.onWidget(Widgets.Message.OpenedPalette()),
            toDialog: message => live.onWidget(Widgets.Message.GotPalette({ message })),
            onQuery: query => live.onWidget(Widgets.Message.TypedPalette({ query })),
            onActive: value => live.onWidget(Widgets.Message.HighlightedPalette({ value })),
            onRun: value => live.onWidget(Widgets.Message.RanPalette({ value })),
            onBack: live.onWidget(Widgets.Message.LeftPalettePage()),
          },
          live.h,
        ),
      pins: { frame: 'bare' },
    },
  ],
)
