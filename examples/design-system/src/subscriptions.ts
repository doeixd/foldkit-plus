/**
 * Another tab's choices: the theme and scheme it kept. This tab's `update` takes
 * them and applies them here. (The toast's timers are the feedback island's own.)
 */
import { Stream } from 'effect'
import { Subscription } from 'foldkit'
import { schemeChanges } from 'foldkit-mixins/theme'
import { themeChanges } from 'foldkit-mixins/theme/runtime'
import { looks } from './looks.js'
import { Message, type Model } from './main.js'

export const subscriptions = Subscription.make<Model, Message>()(() => ({
  theme: Subscription.persistentEntry(
    themeChanges(looks).pipe(Stream.map(name => Message.ThemeChangedElsewhere({ name }))),
  ),
  scheme: Subscription.persistentEntry(
    schemeChanges().pipe(Stream.map(scheme => Message.SchemeChangedElsewhere({ scheme }))),
  ),
}))
