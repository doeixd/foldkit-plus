import { AppShellSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import { frame } from '../previewShared.js'

export const showcase = fromRecipe(
  about('app-shell'),
  AppShellSlots,
  Recipes.AppShell,
  (style, live) =>
    frame(live.h, { height: '22rem', overflow: 'auto' }, [Snippet.appShell(style, live.h)]),
  undefined,
  [
    {
      name: 'basic',
      title: 'Basic',
      draw: (style, live) =>
        frame(live.h, { height: '22rem', overflow: 'auto' }, [Snippet.appShell(style, live.h)]),
    },
  ],
)
