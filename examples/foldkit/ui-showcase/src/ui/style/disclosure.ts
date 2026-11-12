import { Slots, Style } from 'foldkit-mixins'
import { DisclosureSlots, Recipes } from 'foldkit-mixins-ui'

import { forSlots, t } from '../../style.js'
import { container, demoSlots, demoStyles, shadow } from './shared.js'

export const DisclosurePageSlots = Slots.define({
  ...demoSlots,
  demo: container,
  panelText: container,
  animatedFrame: container,
  article: container,
  articleTitle: container,
  preview: container,
  previewText: container,
  previewParagraph: container,
  fade: container,
  previewActions: container,
})

const border = `${t.border.thin} solid ${t.outline.default}`

export const DisclosurePageStyle = forSlots(DisclosurePageSlots)(
  {
    ...demoStyles,
    panelText: Style.self({ margin: '0' }),
    animatedFrame: Style.self({ border, borderRadius: t.radius.lg, overflow: 'hidden' }),
    article: Style.self({
      position: 'relative',
      overflow: 'hidden',
      border,
      borderRadius: t.radius.lg,
      background: t.surface.base,
    }),
    articleTitle: Style.self({
      margin: '0',
      padding: `${t.space.sm} ${t.space.md}`,
      fontSize: t.size.md,
      fontWeight: t.weight.normal,
      color: t.text.overt,
    }),
    preview: Style.self({ position: 'relative' }),
    previewText: Style.self({
      display: 'flex',
      flexDirection: 'column',
      gap: t.space.sm,
      lineHeight: t.leading.normal,
      color: t.text.default,
    }),
    previewParagraph: Style.self({ margin: '0' }),
    fade: Style.self({
      position: 'absolute',
      insetInline: '0',
      bottom: '0',
      height: '4rem',
      background: `linear-gradient(to top, ${t.surface.base}, transparent)`,
      pointerEvents: 'none',
    }),
    previewActions: Style.self({
      position: 'absolute',
      insetInline: '0',
      bottom: '0.625rem',
      display: 'flex',
      justifyContent: 'center',
      paddingInline: t.space.md,
    }),
  },
  { name: 'DisclosurePageStyle' },
)

/** A bordered button that squares its lower corners onto the panel below it while open. */
export const BasicDisclosureStyle = forSlots(DisclosureSlots)(
  Recipes.Disclosure({ variant: 'bordered' }),
  { name: 'BasicDisclosureStyle' },
)

/** Inside a bordered frame; `animatePanel` slides the panel's height. */
export const AnimatedDisclosureStyle = forSlots(DisclosureSlots)(
  Recipes.Disclosure({ variant: 'ghost' }),
  { name: 'AnimatedDisclosureStyle' },
)

/** A pill under a peek of the article, which makes room for the pill while open. */
export const PreviewDisclosureStyle = forSlots(DisclosureSlots)(
  {
    button: Style.compose(
      Style.self({
        padding: `${t.space.xs} 1.25rem`,
        border,
        borderRadius: t.radius.full,
        background: t.surface.base,
        font: 'inherit',
        fontSize: t.size.sm,
        fontWeight: t.weight.medium,
        whiteSpace: 'nowrap',
        color: t.text.overt,
        boxShadow: shadow.sm,
        cursor: 'pointer',
        userSelect: 'none',
      }),
      Style.pseudo(':hover', { background: t.surface.muted }),
      Style.pseudo(':focus-visible', {
        outline: `${t.border.thick} solid ${t.accent.default}`,
        outlineOffset: '2px',
      }),
    ),
    panel: Style.compose(
      Style.self({
        padding: `${t.space.sm} ${t.space.md}`,
        borderTop: border,
      }),
      Style.pseudo('[data-open]', { paddingBottom: '5rem' }),
    ),
  },
  { name: 'PreviewDisclosureStyle' },
)
