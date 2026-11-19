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
  pillLabel: Slot.make({ capability: Capability.Container }),
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
        // The corner is `data-corner`'s; `--demo-guide-inset` moves the pill off the
        // screen's edge, and the default is the corner of the pill's own gutter.
        insetInlineEnd: 'var(--demo-guide-inset, 1rem)',
        insetBlockEnd: 'var(--demo-guide-inset, 1rem)',
        // A layout that stretches its children (a stack) cannot stretch this one.
        maxInlineSize: 'max-content',
        zIndex: '50',
        colorScheme: 'light dark',
        color: ink,
        font: '13px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif',
      }),
      Style.nest('&[open] > summary::after', { transform: 'translateY(1px) rotate(225deg)' }),
      Style.nest('&[data-corner="bottom-start"]', {
        insetInlineStart: 'var(--demo-guide-inset, 1rem)',
        insetInlineEnd: 'auto',
      }),
      Style.nest('&[data-corner="top-end"]', {
        insetBlockStart: 'var(--demo-guide-inset, 1rem)',
        insetBlockEnd: 'auto',
      }),
      Style.nest('&[data-corner="top-start"]', {
        insetInlineStart: 'var(--demo-guide-inset, 1rem)',
        insetInlineEnd: 'auto',
        insetBlockStart: 'var(--demo-guide-inset, 1rem)',
        insetBlockEnd: 'auto',
      }),
      // On a phone a fixed pill covers whatever scrolls under it, so a page can ask for it in its
      // flow, where it takes a place of its own and covers nothing. Later than the corners, whose
      // insets it undoes.
      Style.at(
        '@media (max-width: 63.99rem)',
        Style.nest('&[data-flow-phone]', {
          position: 'relative',
          insetBlock: 'auto',
          insetInline: 'auto',
          marginInlineStart: 'auto',
        }),
      ),
      // The pill sits over the page's last lines: a page that scrolls ends in room as tall
      // as the pill and its margins, so they scroll clear of it. A block after the body's
      // content, not the body's padding, which a page's own unlayered rule would win over.
      // Only a bottom corner covers the end, and a shell that fills the screen asks for
      // none (`reserve: false`), since it has no end to scroll to.
      Style.nest('body:has(&[data-corner^="bottom"]:not([data-reserve="false"]))::after', {
        content: '""',
        display: 'block',
        blockSize: '4.25rem',
      }),
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
      // Collapsed to a dot: the words stay for a screen reader, and the pill takes a finger's square.
      Style.nest('[data-compact] > &', {
        justifyContent: 'center',
        width: '2.25rem',
        padding: '0',
        gap: '0',
      }),
      Style.nest('[data-compact] > &::after', { display: 'none' }),
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
    pillLabel: Style.compose(
      Style.nest('[data-compact] &', {
        position: 'absolute',
        width: '1px',
        height: '1px',
        overflow: 'hidden',
        clipPath: 'inset(50%)',
        whiteSpace: 'nowrap',
      }),
    ),
    panel: Style.compose(
      Style.self({
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
      // The panel opens away from the screen's edge the pill sits against, and grows from its side.
      Style.nest('[data-corner="bottom-start"] > &', {
        insetInlineEnd: 'auto',
        insetInlineStart: '0',
      }),
      Style.nest('[data-corner="top-end"] > &', {
        insetBlockEnd: 'auto',
        insetBlockStart: 'calc(100% + 0.5rem)',
      }),
      Style.nest('[data-corner="top-start"] > &', {
        insetInlineEnd: 'auto',
        insetInlineStart: '0',
        insetBlockEnd: 'auto',
        insetBlockStart: 'calc(100% + 0.5rem)',
      }),
    ),
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
      // A finger's target: at least 24px tall, as the words alone are not.
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        minBlockSize: '1.5rem',
        color: ink,
        fontWeight: '500',
        textDecoration: 'none',
      }),
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

/** The screen corner the pill sits in. */
export type GuideCorner = 'bottom-end' | 'bottom-start' | 'top-end' | 'top-start'

/**
 * The guide view for an application whose Messages are `Message`: called once,
 * where the application defines its views, since a builder cannot be shared
 * across Message universes. The guide sends none; it opens and closes as a
 * `<details>` does.
 *
 * Placement, for a demo whose own controls fill a corner: `corner` picks the
 * screen corner (bottom-end by default), `inset` is its distance from the edge
 * (any CSS length, `1rem` by default), `compact` collapses the pill to a dot
 * with the same name for a screen reader, `flowOnPhone` draws it in the page's
 * flow, at the end of its line, below 64rem (draw the guide where it should sit
 * in the page), and `reserve: false` keeps a page
 * that fills the screen from gaining a block of room at its end for the pill
 * (a page that scrolls ends in that room, so its last lines scroll clear).
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
          corner = 'bottom-end',
          inset,
          compact = false,
          reserve = true,
          flowOnPhone = false,
        }: {
          readonly demo: Demo
          readonly more?: ReadonlyArray<string>
          readonly links?: ReadonlyArray<GuideLink>
          readonly corner?: GuideCorner
          readonly inset?: string
          readonly compact?: boolean
          readonly reserve?: boolean
          readonly flowOnPhone?: boolean
        },
        slots,
        h,
      ) =>
        h.details(
          slots.root.attrs([
            h.DataAttribute('corner', corner),
            ...(compact ? [h.DataAttribute('compact', '')] : []),
            ...(reserve ? [] : [h.DataAttribute('reserve', 'false')]),
            ...(flowOnPhone ? [h.DataAttribute('flow-phone', '')] : []),
            ...(inset === undefined ? [] : [h.Style({ '--demo-guide-inset': inset })]),
          ]),
          [
            h.summary(slots.pill.attrs(), [
              h.span(slots.pillLabel.attrs(), ['How to try this demo']),
            ]),
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
          ],
        ),
    )
    .pipe(Style.attach(GuideStyle))
