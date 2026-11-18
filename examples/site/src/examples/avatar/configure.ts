import { Avatar, AvatarGroupSlots, AvatarSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { portrait } from '../../snippets/portrait.js'
import { row } from '../../snippets/layout.js'
import { forSlots } from '../../snippets/theme.js'

// Stated once, at module scope: the look and words every avatar of the
// application starts from, and the look of its groups. A preset's `style` is
// worn by a group's avatars too.
const Face = forSlots(AvatarSlots)(Recipes.Avatar({ ring: 'page', color: 'name' }))
const Big = forSlots(AvatarSlots)(Recipes.Avatar({ size: 'lg', color: 'name' }))
const Stack = forSlots(AvatarGroupSlots)(Recipes.AvatarGroup({}))

const AppAvatar = Avatar.configure({
  base: { style: Face, groupStyle: Stack, words: { online: 'Here now' } },
  presets: { profile: { style: Big } },
})

export default example({
  title: 'Configure once',
  slots: AvatarSlots,
  recipe: Recipes.Avatar,
  view: ({ h }) =>
    row(h, [
      AppAvatar.view({ name: 'Ada Lovelace', status: 'online', src: portrait(210) }, h),
      AppAvatar.view({ name: 'Grace Hopper', preset: 'profile' }, h),
      AppAvatar.group({ people: [{ name: 'Alan Turing' }, { name: 'Edsger Dijkstra' }] }, h),
    ]),
})
