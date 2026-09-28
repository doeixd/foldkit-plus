import { Slots, Style, type StyleValue } from 'foldkit-mixins'
import { DisclosureSlots } from 'foldkit-mixins-ui'

import { app, t } from '../../style.js'
import { container, demoSlots, demoStyles, icon, shadow } from './shared.js'

export const DisclosurePageSlots = Slots.define({
  ...demoSlots,
  demo: container,
  buttonContent: container,
  buttonLabel: container,
  chevron: container,
  chevronIcon: container,
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

export const DisclosurePageStyle = Style.forSlots(DisclosurePageSlots)(
  {
    ...demoStyles,
    buttonContent: Style.self({
      display: 'flex',
      width: '100%',
      alignItems: 'center',
      justifyContent: 'space-between',
    }),
    // `@foldkit/ui` marks the open button `data-open`.
    chevron: Style.compose(
      Style.self({ display: 'flex', color: t.text.muted }),
      Style.nest('[data-open] &', { rotate: '180deg' }),
    ),
    chevronIcon: icon('1rem'),
    panelText: Style.self({ margin: '0', color: t.text.default }),
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
  { name: 'DisclosurePageStyle', layer: app },
)

const toggle: StyleValue = Style.compose(
  Style.self({
    display: 'flex',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${t.space.sm} ${t.space.md}`,
    border: '0',
    background: 'transparent',
    font: 'inherit',
    textAlign: 'left',
    color: t.text.overt,
    cursor: 'pointer',
    userSelect: 'none',
    transition: `background-color ${t.motion.fast} ${t.motion.ease}`,
  }),
  Style.pseudo(':hover', { background: t.surface.muted }),
  Style.pseudo('[data-disabled]', { opacity: '0.5', cursor: 'not-allowed' }),
)

/** A bordered toggle that squares its lower corners onto the panel below it while open. */
export const BasicDisclosureStyle = Style.forSlots(DisclosureSlots)(
  {
    button: Style.compose(
      toggle,
      Style.self({ border, borderRadius: t.radius.lg }),
      Style.pseudo('[data-open]', { borderBottomLeftRadius: '0', borderBottomRightRadius: '0' }),
    ),
    panel: Style.self({
      padding: `${t.space.sm} ${t.space.md}`,
      border,
      borderTop: '0',
      borderRadius: `0 0 ${t.radius.lg} ${t.radius.lg}`,
    }),
  },
  { name: 'BasicDisclosureStyle', layer: app },
)

/** Inside a bordered frame; `animatePanel` slides the panel's height. */
export const AnimatedDisclosureStyle = Style.forSlots(DisclosureSlots)(
  {
    button: Style.compose(
      toggle,
      Style.pseudo(':focus-visible', {
        outline: `${t.border.thick} solid ${t.accent.default}`,
        outlineOffset: '-2px',
      }),
    ),
    panel: Style.self({ padding: `${t.space.sm} ${t.space.md}`, borderTop: border }),
  },
  { name: 'AnimatedDisclosureStyle', layer: app },
)

/** A pill under a peek of the article, which makes room for the pill while open. */
export const PreviewDisclosureStyle = Style.forSlots(DisclosureSlots)(
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
  { name: 'PreviewDisclosureStyle', layer: app },
)
