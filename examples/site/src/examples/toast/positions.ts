import { Bundle } from 'foldkit-bundle'
import { Bundles, Button, ButtonSlots, Recipes, Toast, ToastSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Choose = forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral', variant: 'outline' }))

// A stack stands where its Model says (`position`), so a place is a stack:
// one Bundle each, in a field of its own.
const App = Bundle.compose({}).pipe(
  Bundle.withMessages({ Raised: { place: Toast.Position } }),
  Bundle.withChild('topStart', Bundles.Toast, {
    args: { id: 'positions-top-start', position: 'top-start' },
    onOut: Bundle.ignore,
  }),
  Bundle.withChild('topCenter', Bundles.Toast, {
    args: { id: 'positions-top-center', position: 'top-center' },
    onOut: Bundle.ignore,
  }),
  Bundle.withChild('topEnd', Bundles.Toast, {
    args: { id: 'positions-top-end', position: 'top-end' },
    onOut: Bundle.ignore,
  }),
  Bundle.withChild('bottomStart', Bundles.Toast, {
    args: { id: 'positions-bottom-start', position: 'bottom-start' },
    onOut: Bundle.ignore,
  }),
  Bundle.withChild('bottomCenter', Bundles.Toast, {
    args: { id: 'positions-bottom-center', position: 'bottom-center' },
    onOut: Bundle.ignore,
  }),
  Bundle.withChild('bottomEnd', Bundles.Toast, {
    args: { id: 'positions-bottom-end', position: 'bottom-end' },
    onOut: Bundle.ignore,
  }),
)

const show = {
  'top-start': App.children.topStart.helpers.show,
  'top-center': App.children.topCenter.helpers.show,
  'top-end': App.children.topEnd.helpers.show,
  'bottom-start': App.children.bottomStart.helpers.show,
  'bottom-center': App.children.bottomCenter.helpers.show,
  'bottom-end': App.children.bottomEnd.helpers.show,
}

export default example({
  title: 'Positions',
  slots: ToastSlots,
  recipe: Recipes.Toast,
  state: App.placements.runtime({
    Model: App.Model,
    initial: {},
    update: App.placements.update((model, { place }) =>
      show[place]({ type: 'success', title: `Saved, at ${place}` })(model),
    ),
  }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' })],
      [
        ...Toast.Position.literals.map(place =>
          Button.view(
            { label: place, onClick: onMessage(App.Message.Raised({ place })), style: Choose },
            h,
          ),
        ),
        Toast.view(
          {
            model: model.topStart,
            onMessage: message => onMessage(App.Message.GotTopStartMessage({ message })),
            label: 'Notifications, top start',
            style,
          },
          h,
        ),
        Toast.view(
          {
            model: model.topCenter,
            onMessage: message => onMessage(App.Message.GotTopCenterMessage({ message })),
            label: 'Notifications, top center',
            style,
          },
          h,
        ),
        Toast.view(
          {
            model: model.topEnd,
            onMessage: message => onMessage(App.Message.GotTopEndMessage({ message })),
            label: 'Notifications, top end',
            style,
          },
          h,
        ),
        Toast.view(
          {
            model: model.bottomStart,
            onMessage: message => onMessage(App.Message.GotBottomStartMessage({ message })),
            label: 'Notifications, bottom start',
            style,
          },
          h,
        ),
        Toast.view(
          {
            model: model.bottomCenter,
            onMessage: message => onMessage(App.Message.GotBottomCenterMessage({ message })),
            label: 'Notifications, bottom center',
            style,
          },
          h,
        ),
        Toast.view(
          {
            model: model.bottomEnd,
            onMessage: message => onMessage(App.Message.GotBottomEndMessage({ message })),
            label: 'Notifications, bottom end',
            style,
          },
          h,
        ),
      ],
    ),
})
