import { Bundles, Button, ButtonSlots, Drawer, DrawerSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { frame } from '../../gallery/previewShared.js'
import { forSlots } from '../../snippets/theme.js'

const Primary = forSlots(ButtonSlots)(Recipes.Button({}))

// A panel docked to the bottom of the screen: the handle peeks, and a press,
// Enter or a drag opens it. The page under it stays live. `keepFocus` keeps
// focus on the handle when it goes down with focus inside.
export default example({
  title: 'Basic',
  slots: DrawerSlots,
  recipe: Recipes.Drawer,
  state: Bundles.Drawer.with({ id: 'order' }),
  view: ({ style, model, onMessage, h }) =>
    frame(h, { height: '22rem', overflow: 'hidden' }, [
      h.p([h.Style({ margin: '0', padding: '1rem' })], ['The page under the drawer stays live.']),
      Drawer.view(
        {
          model,
          onMessage,
          label: 'Order details',
          style,
          mixins: Drawer.keepFocus,
          draw: ({ panel, handle, body }) =>
            h.aside(
              [...panel, h.AriaLabel('Order')],
              [
                h.button(handle, []),
                h.div(body, [
                  h.div(
                    [
                      h.Style({
                        display: 'grid',
                        gap: '0.75rem',
                        justifyItems: 'start',
                        padding: '0 1rem',
                      }),
                    ],
                    [
                      h.p([h.Style({ margin: '0' })], ['Two items, shipped tomorrow.']),
                      Button.view({ label: 'Track the order', style: Primary }, h),
                    ],
                  ),
                ]),
              ],
            ),
        },
        h,
      ),
    ]),
})
