/**
 * The demo's shadcn-like appearance, as `foldkit-mixins` data.
 *
 * The look comes from two decisions, both in this file:
 *
 * - **Theme knobs.** `surfaceSaturation` near zero gives zinc-like neutrals,
 *   and `radius-factor` above one grows every recipe's corners to shadcn's
 *   `0.625rem` cards and `0.5rem` controls, with no forked CSS.
 * - **Recipe selections.** Each shadcn intent is one selection: `primary` is
 *   Default, `neutral` solid/outline/ghost are Secondary/Outline/Ghost, and
 *   `danger` solid is Destructive.
 */
import { Capability, Slot, Slots, Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities as U } from 'foldkit-mixins/utilities'
import {
  ButtonSlots,
  CheckboxSlots,
  DialogSlots,
  InputSlots,
  Recipes,
  SegmentedSlots,
  SwitchSlots,
  TabsSlots,
  TextareaSlots,
} from 'foldkit-mixins-ui'

const palette = Theme.compose(
  Theme.oklch({
    accent: { h: 222, c: 0.09, l: '52%', dark: { l: '70%', c: 0.1 } },
    // Zinc-like neutrals: barely any chroma in the surfaces.
    surfaceSaturation: 0.003,
    surfaceContrast: '60%',
  }),
  // shadcn's corners: cards at 0.625rem, controls near 0.5rem.
  Theme.define({ knob: { 'radius-factor': '1.4' } }),
)

const app = AppStyle.make({ palette })

export const { t, L } = app
export const stylesheet = app.stylesheet

// --- page chrome ---------------------------------------------------------------

export const PageSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  header: Slot.make({ capability: Capability.Container }),
  eyebrow: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  lede: Slot.make({ capability: Capability.Container }),
  controls: Slot.make({ capability: Capability.Container }),
  controlGroup: Slot.make({ capability: Capability.Container }),
  controlLabel: Slot.make({ capability: Capability.Container }),
  nav: Slot.make({ capability: Capability.Container }),
  navLink: Slot.make({ capability: Capability.Container }),
  section: Slot.make({ capability: Capability.Container }),
  sectionTitle: Slot.make({ capability: Capability.Container }),
  sectionText: Slot.make({ capability: Capability.Container }),
  swatchGrid: Slot.make({ capability: Capability.Container }),
  swatch: Slot.make({ capability: Capability.Container }),
  chip: Slot.make({ capability: Capability.Container }),
  swatchName: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Container }),
  code: Slot.make({ capability: Capability.Container }),
  footer: Slot.make({ capability: Capability.Container }),
})

export const PageStyle = app.slots(
  {
    root: [
      L.in('layouts', Layout.stack({ gap: t.space.xl })),
      U.mx('auto'),
      {
        boxSizing: 'border-box',
        maxWidth: '64rem',
        padding: `clamp(2rem, 6vw, 4rem) ${t.space.lg} ${t.space['2xl']}`,
      },
    ],
    header: L.in('layouts', Layout.stack({ gap: t.space.xs })),
    eyebrow: [U.m('0'), U.text('sm'), U.font('semibold'), U.color('text.muted')],
    title: [
      U.m('0'),
      U.font('bold'),
      U.color('text.overt'),
      { fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', letterSpacing: '-0.025em' },
    ],
    lede: [U.m('0'), U.color('text.muted'), { maxWidth: '40rem' }],
    controls: [
      L.in('layouts', Layout.cluster({ gap: t.space.lg, align: 'end' })),
      {
        padding: t.space.md,
        border: `${t.border.thin} solid ${t.outline.subtle}`,
        borderRadius: t.radius.lg,
        background: t.surface.subtle,
      },
    ],
    controlGroup: L.in('layouts', Layout.stack({ gap: t.space['2xs'] })),
    controlLabel: [U.m('0'), U.text('xs'), U.font('semibold'), U.color('text.muted')],
    nav: [
      L.in('layouts', Layout.cluster({ gap: t.space.sm })),
      {
        position: 'sticky',
        top: '0',
        paddingBlock: t.space.xs,
        background: t.surface.base,
        borderBlockEnd: `${t.border.thin} solid ${t.outline.subtle}`,
      },
    ],
    navLink: [
      U.text('sm'),
      U.font('medium'),
      { color: t.text.muted, textDecoration: 'none' },
      Style.pseudo(':hover', { color: t.text.overt }),
    ],
    section: [L.in('layouts', Layout.stack({ gap: t.space.md })), { scrollMarginTop: '4rem' }],
    sectionTitle: [
      U.m('0'),
      U.font('semibold'),
      U.color('text.overt'),
      { fontSize: '1.25rem', letterSpacing: '-0.015em' },
    ],
    sectionText: [U.m('0'), U.color('text.muted'), { maxWidth: '38rem' }],
    swatchGrid: [
      {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(7rem, 1fr))',
        gap: t.space.sm,
      },
    ],
    swatch: L.in('layouts', Layout.stack({ gap: t.space['3xs'] })),
    chip: [
      {
        blockSize: '2.5rem',
        borderRadius: t.radius.md,
        border: `${t.border.thin} solid ${t.outline.subtle}`,
      },
    ],
    swatchName: [U.m('0'), U.text('xs'), U.color('text.muted')],
    row: [L.in('layouts', Layout.cluster({ gap: t.space.sm, align: 'center' }))],
    code: [
      U.text('sm'),
      {
        fontFamily: t.font.mono,
        background: t.surface.muted,
        border: `${t.border.thin} solid ${t.outline.subtle}`,
        borderRadius: t.radius.md,
        padding: t.space.md,
        overflowX: 'auto',
        whiteSpace: 'pre',
      },
    ],
    footer: [
      U.m('0'),
      U.text('sm'),
      U.color('text.muted'),
      {
        paddingBlockStart: t.space.lg,
        borderBlockStart: `${t.border.thin} solid ${t.outline.subtle}`,
      },
    ],
  },
  { name: 'PageStyle' },
)

// --- shadcn button mapping -------------------------------------------------------

/** Default: the page's ink on the base surface. */
export const PrimaryButtonStyle = app.forSlots(ButtonSlots)(
  Recipes.Button({ variant: 'primary' }),
  {
    name: 'PrimaryButtonStyle',
  },
)
/** Secondary: a quiet neutral fill. */
export const SecondaryButtonStyle = app.forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral' }), {
  name: 'SecondaryButtonStyle',
})
/** Outline: transparent over the page's default line. */
export const OutlineButtonStyle = app.forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'outline' }),
  { name: 'OutlineButtonStyle' },
)
/** Ghost: text only, until the pointer arrives. */
export const GhostButtonStyle = app.forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'ghost' }),
  { name: 'GhostButtonStyle' },
)
/** Destructive: the error family, filled. */
export const DestructiveButtonStyle = app.forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'danger' }),
  { name: 'DestructiveButtonStyle' },
)
/** Small and large densities of the default action. */
export const SmallButtonStyle = app.forSlots(ButtonSlots)(
  Recipes.Button({ variant: 'primary', size: 'sm' }),
  { name: 'SmallButtonStyle' },
)
export const LargeButtonStyle = app.forSlots(ButtonSlots)(
  Recipes.Button({ variant: 'primary', size: 'lg' }),
  { name: 'LargeButtonStyle' },
)

// --- form recipes ---------------------------------------------------------------------------------------------------------------------------------

export const FieldStyle = app.forSlots(InputSlots)(Recipes.Input({ variant: 'outline' }), {
  name: 'FieldStyle',
})
export const FilledFieldStyle = app.forSlots(InputSlots)(Recipes.Input({ variant: 'filled' }), {
  name: 'FilledFieldStyle',
})
export const AreaStyle = app.forSlots(TextareaSlots)(Recipes.Textarea({ variant: 'outline' }), {
  name: 'AreaStyle',
})
export const CheckStyle = app.forSlots(CheckboxSlots)(Recipes.Checkbox({ tone: 'neutral' }), {
  name: 'CheckStyle',
})
export const ToggleStyle = app.forSlots(SwitchSlots)(Recipes.Switch({ tone: 'accent' }), {
  name: 'ToggleStyle',
})

// --- navigation recipes ---------------------------------------------------------------

export const LineTabsStyle = app.forSlots(TabsSlots)(
  Recipes.Tabs({ variant: 'line', size: 'md' }),
  {
    name: 'LineTabsStyle',
  },
)
export const PillTabsStyle = app.forSlots(TabsSlots)(
  Recipes.Tabs({ variant: 'pill', size: 'sm' }),
  {
    name: 'PillTabsStyle',
  },
)
export const PlanStyle = app.forSlots(SegmentedSlots)(
  {
    group: Style.compose(
      L.in('layouts', Layout.cluster({ gap: '2px', align: 'center' })),
      Recipes.Segmented({ tray: 'tray', size: 'sm' }).group ?? Style.empty,
    ),
    option: Recipes.Segmented({ tray: 'tray', size: 'sm' }).option ?? Style.empty,
  },
  { name: 'PlanStyle' },
)

// --- feedback ----------------------------------------------------------------------------

export const BadgeSlots = Slots.define({
  row: Slot.make({ capability: Capability.Container }),
  badge: Slot.make({ capability: Capability.Container }),
})

export const StatusStyle = app.slots(
  {
    row: L.in('layouts', Layout.cluster({ gap: t.space.sm, align: 'center' })),
    badge: [
      Recipes.Badge({
        attribute: 'data-state',
        tones: { ok: 'success', warn: 'warning', info: 'info', bad: 'error' },
      }).badge,
    ],
  },
  { name: 'StatusStyle' },
)

export const DialogPreviewStyle = app.forSlots(DialogSlots)(Recipes.Dialog({ size: 'sm' }), {
  name: 'DialogPreviewStyle',
})

// --- shadcn-style card ---------------------------------------------------------------------

export const CardSlots = Slots.define({
  card: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  content: Slot.make({ capability: Capability.Container }),
  footer: Slot.make({ capability: Capability.Container }),
})

export const CardStyle = app.slots(
  {
    card: [
      L.in('layouts', Layout.stack({ gap: t.space.sm })),
      {
        background: t.surface.base,
        border: `${t.border.thin} solid ${t.outline.subtle}`,
        borderRadius: t.radius.lg,
        boxShadow: t.shadow.sm,
        padding: t.space.lg,
        maxWidth: '24rem',
      },
    ],
    title: [U.m('0'), U.font('semibold'), U.color('text.overt')],
    description: [U.m('0'), U.text('sm'), U.color('text.muted')],
    content: [U.m('0'), U.text('sm'), U.color('text.default')],
    footer: [L.in('layouts', Layout.cluster({ gap: t.space.sm }))],
  },
  { name: 'CardStyle' },
)
