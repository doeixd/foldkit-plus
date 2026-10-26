/**
 * The published demos' one look: the shipped theme, which the guide's accent
 * matches, and a compact one a reader can switch to. A demo takes its
 * tokens (`t`), its Slot styles (`slots`, `forSlots`) and its page stylesheet
 * from here, so every demo answers to the same knobs. Which theme shows is the
 * demo's Model's fact: a field of `demoThemes.Name`, shown with
 * `Themes.choose`, and kept for the next visit by `Themes.script` in the page's
 * head. Light and dark are not themes: the palette follows the reader's
 * colour scheme by itself.
 */
import { AppStyle } from 'foldkit-mixins/app'
import { Theme, Themes } from 'foldkit-mixins/theme'

export const demoThemes = Themes.make(
  {
    standard: Theme.make({}),
    // Tighter spacing and the next size down, for a reader who wants more on the screen.
    compact: Theme.make({ shape: { density: 0.85, size: 'compact' } }),
  },
  { initial: 'standard' },
)

export const demoStyle = AppStyle.make({ themes: demoThemes })
