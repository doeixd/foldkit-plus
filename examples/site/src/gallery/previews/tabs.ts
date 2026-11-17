import type { Tabs as UiTabs } from '@foldkit/ui'
import type { NamedStyle } from 'foldkit-mixins'
import { Recipes, TabsSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const tabsUnderline = <Message>(style: NamedStyle<typeof TabsSlots>, live: Live<Message>) =>
  Snippet.tabs(
    style,
    live.widgets,
    message => live.onWidget(Widgets.Message.GotTabs({ message })),
    live.h,
  )

const inboxMessage =
  <Message>(live: Live<Message>, example: Widgets.InboxExample) =>
  (message: UiTabs.Message) =>
    live.onWidget(Widgets.Message.GotInboxTabs({ example, message }))

const fileMessages = <Message>(live: Live<Message>, example: Widgets.FilesExample) => ({
  toMessage: (message: UiTabs.Message) =>
    live.onWidget(Widgets.Message.GotFileTabs({ example, message })),
  onClose: (file: string) => live.onWidget(Widgets.Message.ClosedFile({ example, file })),
})

export const showcase = fromRecipe(
  about('tabs'),
  TabsSlots,
  Recipes.Tabs,
  tabsUnderline,
  undefined,
  [
    { name: 'underline', title: 'Underline', draw: tabsUnderline },
    {
      name: 'pill',
      title: 'Pill',
      draw: (style, live) =>
        Snippet.tabs(
          style,
          live.widgets.pillTabs,
          message => live.onWidget(Widgets.Message.GotPillTabs({ message })),
          live.h,
        ),
      pins: { variant: 'pill' },
    },
    {
      name: 'icons',
      title: 'Icons and counts',
      draw: (style, live) =>
        Snippet.tabsIcons(style, live.widgets.inboxes.icons, inboxMessage(live, 'icons'), live.h),
    },
    {
      name: 'vertical',
      title: 'Vertical',
      draw: (style, live) =>
        Snippet.tabsVertical(
          style,
          live.widgets.inboxes.vertical,
          inboxMessage(live, 'vertical'),
          live.h,
        ),
    },
    {
      name: 'closable',
      title: 'Closable',
      draw: (style, live) =>
        Snippet.tabsClosable(
          style,
          live.widgets.files.closable,
          fileMessages(live, 'closable'),
          live.h,
        ),
    },
    {
      name: 'scrolling',
      title: 'Scrolling',
      draw: (style, live) =>
        Snippet.tabsScrolling(
          style,
          live.widgets.files.scrolling,
          fileMessages(live, 'scrolling'),
          live.h,
        ),
      pins: { overflow: 'scroll' },
    },
  ],
)
