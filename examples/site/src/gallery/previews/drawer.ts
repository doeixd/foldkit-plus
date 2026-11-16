import { DrawerSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import { frame } from '../previewShared.js'
import type { Live } from '../showcase.js'
import type { NamedStyle } from 'foldkit-mixins'

const drawn = <Message>(style: NamedStyle<typeof DrawerSlots>, live: Live<Message>) =>
  frame(live.h, { height: '22rem', overflow: 'hidden' }, [
    live.h.p(
      [live.h.Style({ margin: '0', padding: '1rem' })],
      ['The page under the drawer stays live.'],
    ),
    Snippet.drawer(
      style,
      live.widgets.drawer,
      message => live.onWidget(Widgets.Message.GotDrawer({ message })),
      live.h,
    ),
  ])

// The dock axis is the viewport's width, which a frame in the page does not change: the page shows it docked.
export const showcase = fromRecipe(
  about('drawer'),
  DrawerSlots,
  Recipes.Drawer,
  drawn,
  [],
  [{ name: 'basic', title: 'Basic', draw: drawn }],
)
