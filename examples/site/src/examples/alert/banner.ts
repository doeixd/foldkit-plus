import { Alert, AlertSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// As a banner, a named landmark across the page: it is there when the page
// loads, so it is a region a screen reader can find, not a live one.
export default example({
  title: 'Banner',
  slots: AlertSlots,
  recipe: Recipes.Alert,
  view: ({ style, h }) =>
    Alert.view(
      {
        layout: 'banner',
        label: 'Announcement',
        title: 'Version 2 is out, with offline sync.',
        actions: [{ label: 'Read the notes', href: '#' }],
        style,
      },
      h,
    ),
})
