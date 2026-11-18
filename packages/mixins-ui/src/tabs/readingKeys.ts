import { Behavior, Capability } from 'foldkit-mixins'
import { ReadingKeys } from '../direction.js'
import { TabsSlots } from './slots.js'

/**
 * Arrow keys read by the direction the tablist is drawn in: right to left,
 * ArrowLeft goes to the next tab, as the APG asks. Upstream's keys know no
 * direction, and its bundles no view option reaches, so this is a Mount
 * (`ReadingKeys`) that reads the key before upstream's handler does. Pass it
 * beside the style where the page may be right to left. It is not built in
 * because a Scene test must resolve every Mount with a Message, and this one
 * has none to give.
 */
export const readingKeys = Behavior.forSlots(TabsSlots)<unknown, never>(
  {
    tablist: Behavior.slot({
      requires: { capability: Capability.Container },
      mount: () => ReadingKeys(),
    }),
  },
  { name: 'TabsReadingKeys' },
).mixin
