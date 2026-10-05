/**
 * What a demo is and what to try, as every demo draws it at the top of its
 * first screen: the sentence its card says, its steps, and the way back to
 * the other demos and on to its code. One look in every demo, so its values
 * are its own rather than read from the application's theme.
 */
import { Capability, Layers, Slot, Slots, SlotView, Style } from 'foldkit-mixins'

import { SITE_URL, onGitHub, type Demo } from './demos.js'

const accent = 'oklch(52% 0.17 270)'
const tint = (percent: number) => `color-mix(in oklch, ${accent} ${percent}%, white)`

export const IntroSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  summary: Slot.make({ capability: Capability.Focusable }),
  lede: Slot.make({ capability: Capability.Container }),
  steps: Slot.make({ capability: Capability.Container }),
  step: Slot.make({ capability: Capability.Container }),
  stepLabel: Slot.make({ capability: Capability.Container }),
  stepText: Slot.make({ capability: Capability.Container }),
  links: Slot.make({ capability: Capability.Container }),
  link: Slot.make({ capability: Capability.Focusable }),
})

export const IntroStyle = Style.forSlots(IntroSlots)(
  {
    root: Style.compose(
      Style.self({
        boxSizing: 'border-box',
        background: tint(6),
        border: `1px solid ${tint(22)}`,
        borderRadius: '10px',
        color: 'oklch(28% 0.02 270)',
        font: '14px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif',
        overflow: 'hidden',
      }),
      Style.nest('&[open] > summary', { borderBlockEnd: `1px solid ${tint(18)}` }),
      // The chevron turns down while the intro is open.
      Style.nest('&[open] > summary::before', { transform: 'rotate(45deg)' }),
    ),
    summary: Style.compose(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        gap: '0.625rem',
        listStyle: 'none',
        cursor: 'pointer',
        padding: '0.75rem 1.25rem',
        color: 'oklch(20% 0.02 270)',
        fontSize: '15px',
        fontWeight: '600',
      }),
      Style.nest('&::-webkit-details-marker', { display: 'none' }),
      Style.nest('&::before', {
        content: '""',
        flex: 'none',
        width: '0.4rem',
        height: '0.4rem',
        borderInlineEnd: `2px solid ${accent}`,
        borderBlockEnd: `2px solid ${accent}`,
        transform: 'rotate(-45deg)',
        transition: 'transform 120ms ease',
      }),
      Style.pseudo(':hover', { background: tint(10) }),
      Style.pseudo(':focus-visible', { outline: `2px solid ${accent}`, outlineOffset: '-2px' }),
    ),
    lede: Style.self({ margin: '0', padding: '0.875rem 1.25rem 0' }),
    // Side by side where the box is wide, as the registry's step cards are; stacked where not.
    steps: Style.self({
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))',
      gap: '0.75rem 1.5rem',
      margin: '0.875rem 0 0',
      padding: '0 1.25rem',
      listStyle: 'none',
    }),
    step: Style.self({ display: 'grid', alignContent: 'start', gap: '0.125rem', margin: '0' }),
    stepLabel: Style.self({
      color: accent,
      fontSize: '12px',
      fontWeight: '600',
      letterSpacing: '0.02em',
    }),
    stepText: Style.self({ color: 'oklch(28% 0.02 270)' }),
    links: Style.self({
      margin: '0.875rem 0 0',
      padding: '0 1.25rem 1rem',
      fontSize: '13px',
      color: 'oklch(45% 0.02 270)',
    }),
    link: Style.compose(
      Style.self({ color: accent, textDecoration: 'underline', textUnderlineOffset: '0.15em' }),
      Style.pseudo(':hover', { color: 'oklch(42% 0.17 270)' }),
      Style.pseudo(':focus-visible', { outline: `2px solid ${accent}`, outlineOffset: '2px' }),
    ),
  },
  // The standard order's last layer, as an application's own styles are.
  { name: 'DemoIntro', layer: Layers.standard.layer('app') },
)

/**
 * The intro view for an application whose Messages are `Message`: called once,
 * where the application defines its views, since a builder cannot be shared
 * across Message universes. The intro sends none.
 *
 * Drawn with a demo, open at first. `more` adds sentences after what the demo
 * proves, for what the page knows and the card cannot (who you are).
 */
export const demoIntro = <Message>() =>
  SlotView.forMessages<Message>()
    .define(
      IntroSlots,
      (
        { demo, more = [] }: { readonly demo: Demo; readonly more?: ReadonlyArray<string> },
        slots,
        h,
      ) =>
        h.details(slots.root.attrs([h.Open(true)]), [
          h.summary(slots.summary.attrs(), ['What this is, and what to try']),
          h.p(slots.lede.attrs(), [[demo.proves, ...more].join(' ')]),
          h.ol(
            slots.steps.attrs(),
            demo.tryThis.map((step, index) =>
              h.li(slots.step.attrs(), [
                h.span(slots.stepLabel.attrs(), [`${index + 1} · ${step.title}`]),
                h.span(slots.stepText.attrs(), [step.text]),
              ]),
            ),
          ),
          h.p(slots.links.attrs(), [
            h.a(slots.link.attrs([h.Href(SITE_URL)]), ['All the demos']),
            ' · ',
            h.a(slots.link.attrs([h.Href(onGitHub(demo.readFirst))]), ['Read its code']),
          ]),
        ]),
    )
    .pipe(Style.attach(IntroStyle))
