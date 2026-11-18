import { Alert, AlertSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// Inline, a status inside the content: a live region, so a screen reader
// speaks it when it appears. `assertive: true` makes it `role="alert"`.
export default example({
  title: 'Inline',
  slots: AlertSlots,
  recipe: Recipes.Alert,
  view: ({ style, h }) =>
    Alert.view(
      {
        layout: 'inline',
        title: 'A new version is out',
        description: 'Reload to pick up the latest fixes. Your drafts are kept.',
        actions: [{ label: 'Reload', href: '#' }],
        style,
      },
      h,
    ),
})
