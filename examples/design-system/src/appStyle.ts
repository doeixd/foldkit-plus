/**
 * The demo's themes: a few named sets of knob values, installed with
 * `Themes.make`. The root declares the first, `shadcn`, and each other writes
 * its knobs under `:root[data-theme="name"]`; every token derives from the
 * knobs, so a theme is only these numbers and choices. The page's sheet
 * (`sheet.ts`) and the Styles (`style.ts`) are built from it.
 */
import { AppStyle } from 'foldkit-mixins/app'
import { Theme, Themes } from 'foldkit-mixins/theme'

export const themes = Themes.make(
  {
    // Near-zinc surfaces, a roomy radius and soft shadows: the shadcn look.
    shadcn: Theme.make({ shadow: { strength: 100 } }),
    // Tighter spacing, the next size down, and corners squared off a little.
    compact: Theme.make({
      shape: { density: 0.85, size: 'compact', radius: 0.3 },
      shadow: { strength: 60 },
    }),
    // Roomier, rounder, pill buttons and a rose accent.
    soft: Theme.make({
      accent: { hue: 336 },
      shape: { density: 1.2, radius: 1.3, controls: 'pill' },
      shadow: { strength: 100 },
    }),
    // Square corners, thick borders, hard offset shadows and no motion.
    hard: Theme.make({
      accent: { hue: 38 },
      shape: { radius: 0, border: 2 },
      shadow: { style: 'hard', strength: 100 },
      motion: { scale: 0 },
    }),
  },
  { initial: 'shadcn' },
)

export const app = AppStyle.make({ themes })

export const { t, L } = app
export const stylesheet = app.stylesheet
