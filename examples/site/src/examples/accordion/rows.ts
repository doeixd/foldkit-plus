import {
  Accordion,
  AccordionSlots,
  Avatar,
  AvatarSlots,
  Badge,
  BadgeSlots,
  Bundles,
  Recipes,
} from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { portrait } from '../../snippets/portrait.js'
import { forSlots } from '../../snippets/theme.js'

const Face = forSlots(AvatarSlots)(Recipes.Avatar({ size: 'sm' }))
const Mark = forSlots(BadgeSlots)(Recipes.Badge({}))

// A row's `icon` stands before its title and its `trailing` after it: an
// avatar and a role here, any drawing the application makes. The title stays
// text, since it names the row and keeps its width when the row turns bold.
export default example({
  title: 'Avatars and roles',
  slots: AccordionSlots,
  recipe: Recipes.Accordion,
  state: Bundles.Accordion.with({ open: ['ada'] }),
  view: ({ style, model, onMessage, h }) =>
    Accordion.view(
      {
        id: 'acc-rows',
        items: [
          {
            id: 'ada',
            title: 'Ada Lovelace',
            icon: Avatar.view({ name: 'Ada Lovelace', src: portrait(210), style: Face }, h),
            trailing: Badge.view({ text: 'Owner', tone: 'accent', style: Mark }, h),
            content: 'Owns billing and can remove anyone.',
          },
          {
            id: 'alan',
            title: 'Alan Turing',
            icon: Avatar.view({ name: 'Alan Turing', src: portrait(140), style: Face }, h),
            trailing: Badge.view({ text: 'Admin', style: Mark }, h),
            content: 'Manages the team and its API keys.',
          },
          {
            id: 'grace',
            title: 'Grace Hopper',
            icon: Avatar.view({ name: 'Grace Hopper', src: portrait(20), style: Face }, h),
            trailing: Badge.view({ text: 'Viewer', tone: 'neutral', style: Mark }, h),
            content: 'Reads reports and cannot change settings.',
          },
        ],
        ...Accordion.controls(model, onMessage),
        style,
      },
      h,
    ),
})
