/**
 * How to try a demo, as every demo offers it: a small pill in the corner of the
 * screen, out of the application's way, that opens a short guide — what the
 * demo shows, its steps, and the way to the other demos and to its code. One
 * look in every demo, so its values are its own rather than read from the
 * application's theme.
 */
import { Capability, Layers, Slot, Slots, SlotView, Style } from 'foldkit-mixins'

import { SITE_URL, onGitHub, type Demo } from './demos.js'

// Each colour for a light page and a dark one: the guide follows the reader's
// preference, as the applications' themes do.
const ink = 'light-dark(oklch(21% 0.006 286), oklch(96% 0.003 286))'
const muted = 'light-dark(oklch(45% 0.01 286), oklch(72% 0.01 286))'
const hairline = 'light-dark(oklch(92% 0.004 286), oklch(30% 0.006 286))'
const strongLine = 'light-dark(oklch(85% 0.004 286), oklch(40% 0.006 286))'
const surface = 'light-dark(white, oklch(22% 0.006 286))'
const well = 'light-dark(oklch(96.5% 0.003 286), oklch(28% 0.006 286))'
const accent = 'light-dark(oklch(52% 0.17 270), oklch(72% 0.14 270))'
const lift =
  '0 1px 2px light-dark(rgb(0 0 0 / 0.05), rgb(0 0 0 / 0.3)), 0 8px 24px light-dark(rgb(0 0 0 / 0.08), rgb(0 0 0 / 0.4))'

export const GuideSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  pill: Slot.make({ capability: Capability.Focusable }),
  panel: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  lede: Slot.make({ capability: Capability.Container }),
  steps: Slot.make({ capability: Capability.Container }),
  step: Slot.make({ capability: Capability.Container }),
  number: Slot.make({ capability: Capability.Container }),
  stepTitle: Slot.make({ capability: Capability.Container }),
  stepText: Slot.make({ capability: Capability.Container }),
  links: Slot.make({ capability: Capability.Container }),
  link: Slot.make({ capability: Capability.Focusable }),
})

export const GuideStyle = Style.forSlots(GuideSlots)(
  {
    root: Style.compose(
      Style.self({
        position: 'fixed',
        insetInlineEnd: '1rem',
        insetBlockEnd: '1rem',
        // A layout that stretches its children (a stack) cannot stretch this one.
        maxInlineSize: 'max-content',
        zIndex: '50',
        colorScheme: 'light dark',
        color: ink,
        font: '13px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif',
      }),
      Style.nest('&[open] > summary::after', { transform: 'translateY(1px) rotate(225deg)' }),
    ),
    pill: Style.compose(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        height: '2.25rem',
        padding: '0 0.875rem',
        listStyle: 'none',
        cursor: 'pointer',
        userSelect: 'none',
        background: surface,
        color: ink,
        border: `1px solid ${hairline}`,
        borderRadius: '999px',
        boxShadow: lift,
        fontWeight: '500',
      }),
      Style.nest('&::-webkit-details-marker', { display: 'none' }),
      // A dot that says the pill is the demo's, not the application's.
      Style.nest('&::before', {
        content: '""',
        width: '0.4375rem',
        height: '0.4375rem',
        borderRadius: '50%',
        background: accent,
      }),
      Style.nest('&::after', {
        content: '""',
        width: '0.3125rem',
        height: '0.3125rem',
        marginInlineStart: '0.125rem',
        borderInlineEnd: `1.5px solid ${muted}`,
        borderBlockEnd: `1.5px solid ${muted}`,
        transform: 'translateY(-1px) rotate(45deg)',
      }),
      Style.pseudo(':hover', { borderColor: strongLine }),
      Style.pseudo(':focus-visible', { outline: `2px solid ${accent}`, outlineOffset: '2px' }),
    ),
    panel: Style.self({
      position: 'absolute',
      insetInlineEnd: '0',
      insetBlockEnd: 'calc(100% + 0.5rem)',
      boxSizing: 'border-box',
      display: 'grid',
      gap: '0.875rem',
      width: 'min(22rem, calc(100vw - 2rem))',
      maxHeight: 'calc(100vh - 5rem)',
      overflow: 'auto',
      padding: '1.125rem 1.25rem 1rem',
      background: surface,
      border: `1px solid ${hairline}`,
      borderRadius: '0.875rem',
      boxShadow: lift,
    }),
    title: Style.self({
      margin: '0',
      fontSize: '14px',
      fontWeight: '600',
      letterSpacing: '-0.005em',
    }),
    lede: Style.self({ margin: '-0.5rem 0 0', color: muted }),
    steps: Style.self({
      display: 'grid',
      gap: '0.75rem',
      margin: '0',
      padding: '0',
      listStyle: 'none',
    }),
    step: Style.self({ display: 'grid', gridTemplateColumns: '1.25rem 1fr', gap: '0.625rem' }),
    number: Style.self({
      display: 'grid',
      placeItems: 'center',
      width: '1.25rem',
      height: '1.25rem',
      marginBlockStart: '0.0625rem',
      borderRadius: '50%',
      background: well,
      color: muted,
      fontSize: '11px',
      fontWeight: '600',
    }),
    stepTitle: Style.self({ display: 'block', fontWeight: '500' }),
    stepText: Style.self({ display: 'block', color: muted }),
    links: Style.self({
      display: 'flex',
      flexWrap: 'wrap',
      gap: '0.25rem 1rem',
      margin: '0',
      paddingBlockStart: '0.75rem',
      borderBlockStart: `1px solid ${hairline}`,
    }),
    link: Style.compose(
      Style.self({ color: ink, fontWeight: '500', textDecoration: 'none' }),
      Style.pseudo(':hover', { color: accent }),
      Style.pseudo(':focus-visible', { outline: `2px solid ${accent}`, outlineOffset: '2px' }),
    ),
  },
  // The standard order's last layer, as an application's own styles are.
  { name: 'DemoGuide', layer: Layers.standard.layer('app') },
)

/** A link the guide offers beside the way to the other demos and to the code. */
export interface GuideLink {
  readonly label: string
  readonly href: string
}

/**
 * The guide view for an application whose Messages are `Message`: called once,
 * where the application defines its views, since a builder cannot be shared
 * across Message universes. The guide sends none; it opens and closes as a
 * `<details>` does.
 *
 * Drawn with a demo. `more` adds a sentence after what the demo shows, for
 * what the page knows and the landing page cannot (who you are); `links` adds
 * the page's own (starting the sandbox again).
 */
export const demoGuide = <Message>() =>
  SlotView.forMessages<Message>()
    .define(
      GuideSlots,
      (
        {
          demo,
          more = [],
          links = [],
        }: {
          readonly demo: Demo
          readonly more?: ReadonlyArray<string>
          readonly links?: ReadonlyArray<GuideLink>
        },
        slots,
        h,
      ) =>
        h.details(slots.root.attrs(), [
          h.summary(slots.pill.attrs(), ['How to try this demo']),
          h.div(slots.panel.attrs(), [
            h.p(slots.title.attrs(), [demo.title]),
            h.p(slots.lede.attrs(), [[demo.proves, ...more].join(' ')]),
            h.ol(
              slots.steps.attrs(),
              demo.tryThis.map((step, index) =>
                h.li(slots.step.attrs(), [
                  h.span(slots.number.attrs([h.AriaHidden(true)]), [String(index + 1)]),
                  h.span(
                    [],
                    [
                      h.span(slots.stepTitle.attrs(), [step.title]),
                      h.span(slots.stepText.attrs(), [step.text]),
                    ],
                  ),
                ]),
              ),
            ),
            h.p(slots.links.attrs(), [
              ...links.map(({ label, href }) => h.a(slots.link.attrs([h.Href(href)]), [label])),
              h.a(slots.link.attrs([h.Href(SITE_URL)]), ['All demos']),
              h.a(slots.link.attrs([h.Href(onGitHub(demo.readFirst))]), ['Source']),
            ]),
          ]),
        ]),
    )
    .pipe(Style.attach(GuideStyle))
