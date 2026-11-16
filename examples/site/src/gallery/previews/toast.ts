import type { NamedStyle } from 'foldkit-mixins'
import { Recipes, ToastSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

/** One toast example's stack of the widgets' Model, named for its landmark. */
const toastStack = <Message>(
  live: Live<Message>,
  example: Widgets.ToastExample,
  label: string,
): Snippet.ToastStack<Message> => ({
  model: live.widgets.toasts[example],
  onMessage: message => live.onWidget(Widgets.Message.GotToast({ example, message })),
  label,
})

const toastTypes =
  (example: 'types' | 'rich') =>
  <Message>(style: NamedStyle<typeof ToastSlots>, live: Live<Message>) =>
    Snippet.toastTypes(
      style,
      toastStack(live, example, example === 'rich' ? 'Notifications, rich' : 'Notifications'),
      type => live.onWidget(Widgets.Message.RaisedToast({ example, type })),
      live.h,
    )

export const showcase = fromRecipe(
  about('toast'),
  ToastSlots,
  Recipes.Toast,
  toastTypes('types'),
  undefined,
  [
    { name: 'types', title: 'Types', draw: toastTypes('types') },
    {
      name: 'promise',
      title: 'A promise',
      draw: (style, live) =>
        Snippet.toastPromise(
          style,
          toastStack(live, 'promise', 'Uploads'),
          live.onWidget(Widgets.Message.StartedUpload()),
          live.h,
        ),
    },
    {
      name: 'action',
      title: 'An action',
      draw: (style, live) =>
        Snippet.toastAction(
          style,
          toastStack(live, 'action', 'Archive'),
          live.onWidget(Widgets.Message.Archived()),
          live.h,
        ),
    },
    { name: 'rich', title: 'Rich colors', draw: toastTypes('rich'), pins: { tone: 'rich' } },
    {
      name: 'positions',
      title: 'Positions',
      draw: (style, live) =>
        Snippet.toastPositions(
          style,
          live.widgets.toasts,
          (example, message) => live.onWidget(Widgets.Message.GotToast({ example, message })),
          example => live.onWidget(Widgets.Message.RaisedToast({ example, type: 'success' })),
          live.h,
        ),
    },
    {
      name: 'payload',
      title: 'Your own payload',
      draw: (_style, live) =>
        Snippet.toast(
          Snippet.ToastStyle,
          live.widgets.notices,
          {
            onNotify: live.onWidget(Widgets.Message.SavedDraft()),
            toMessage: message => live.onWidget(Widgets.Message.GotNotices({ message })),
          },
          live.h,
        ),
    },
  ],
)
