/**
 * The stateless views take the application's builder, so what they hold can
 * send its Messages: an empty state's button, a card's badge beside a
 * pressable card. Type-checked, not executed.
 */
import { Behavior } from 'foldkit-mixins'
import { Alert, Badge, BadgeSlots, Button, Card, Empty } from '../src/index.js'
import { h, message, type TestMessage } from './fixture.js'

export const empty = Empty.view(
  {
    title: 'No projects yet',
    action: Button.view({ label: 'New project', onClick: message('Clicked') }, h),
  },
  h,
)

export const card = Card.view(
  {
    title: 'Team',
    press: { onClick: message('Clicked') },
    action: Badge.view({ text: 'New' }, h),
  },
  h,
)

type ForeignMessage = { readonly _tag: 'Foreign' }
const Foreign = Behavior.forSlots(BadgeSlots)<undefined, ForeignMessage>({
  badge: Behavior.slot({ attributes: () => [] }),
})
const Own = Behavior.forSlots(BadgeSlots)<undefined, TestMessage>({
  badge: Behavior.slot({ attributes: () => [] }),
})

export const own = Badge.view({ text: 'New', mixins: [Own.mixin] }, h)

// @ts-expect-error a Behavior from another Message universe cannot attach here.
export const foreign = Badge.view({ text: 'New', mixins: [Foreign.mixin] }, h)

export const banner = Alert.view(
  {
    layout: 'banner',
    label: 'News',
    title: 'v2 is out.',
    actions: [{ label: 'Upgrade', onClick: message('Other') }],
    onDismiss: message('Clicked'),
  },
  h,
)

export const urgentBanner = Alert.view(
  // @ts-expect-error a banner is a landmark, not a live region: it has no urgency.
  { layout: 'banner', label: 'News', title: 'Hi', assertive: true },
  h,
)

export const namelessBanner = Alert.view(
  // @ts-expect-error a banner's landmark needs a name.
  { layout: 'banner', title: 'Hi' },
  h,
)

export const labelledInline = Alert.view(
  // @ts-expect-error an inline alert is a live region, not a named landmark.
  { layout: 'inline', label: 'News', title: 'Hi' },
  h,
)

export const foreignAction = Alert.view(
  // @ts-expect-error an action's Message is the application's.
  { layout: 'inline', title: 'Hi', actions: [{ label: 'Go', onClick: { _tag: 'Foreign' } }] },
  h,
)
