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
  CalendarSlots,
  CheckboxSlots,
  ComboboxSlots,
  DialogSlots,
  DisclosureSlots,
  FieldsetSlots,
  FileDropSlots,
  HoverIntentSlots,
  Icons,
  InputSlots,
  ListboxSlots,
  MenuSlots,
  PopoverSlots,
  RadioGroupSlots,
  Recipes,
  SegmentedSlots,
  SelectSlots,
  SliderSlots,
  SwitchSlots,
  TabsSlots,
  TextareaSlots,
  ToastSlots,
  TooltipSlots,
  Touch,
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
        zIndex: '10',
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

/**
 * Select has no shipped recipe, so it is styled here to match the text
 * field: the same border, radius, and density, with room for a chevron.
 */
export const SelectStyle = app.forSlots(SelectSlots)(
  {
    select: [
      L.in('layouts', Layout.stack({ gap: '0' })),
      {
        display: 'block',
        inlineSize: '100%',
        padding: `${t.space.xs} 2rem ${t.space.xs} ${t.space.sm}`,
        border: `${t.border.thin} solid ${t.outline.default}`,
        borderRadius: t.radius.md,
        background: t.surface.base,
        color: t.text.default,
        font: 'inherit',
        lineHeight: t.leading.normal,
        appearance: 'none',
      },
      Style.pseudo(':hover:not(:focus, :disabled)', { borderColor: t.outline.overt }),
      Style.pseudo(':focus-visible', {
        outline: `${t.border.thick} solid ${t.outline.focus}`,
        outlineOffset: '2px',
      }),
    ],
    label: [
      U.m('0'),
      U.text('sm'),
      U.font('medium'),
      U.color('text.overt'),
      { display: 'block', marginBlockEnd: t.space['2xs'] },
    ],
    description: [U.m('0'), U.text('sm'), U.color('text.muted')],
  },
  { name: 'SelectStyle' },
)

/** A collapsible section: a ghost-like trigger and an indented panel. */
export const DisclosureStyle = app.forSlots(DisclosureSlots)(
  {
    button: [
      U.text('sm'),
      U.font('medium'),
      {
        display: 'inline-flex',
        alignItems: 'center',
        gap: t.space.xs,
        padding: `${t.space.xs} ${t.space.sm}`,
        border: `${t.border.thin} solid ${t.outline.default}`,
        borderRadius: t.radius.md,
        background: 'transparent',
        color: t.text.default,
        font: 'inherit',
        cursor: 'pointer',
      },
      Style.pseudo(':hover', { background: t.surface.muted }),
    ],
    panel: [
      {
        marginBlockStart: t.space.xs,
        padding: t.space.sm,
        paddingInlineStart: t.space.md,
        borderInlineStart: `${t.border.thick} solid ${t.outline.default}`,
        color: t.text.muted,
      },
    ],
  },
  { name: 'DisclosureStyle' },
)

/** A grouped set of controls with a legend, drawn as a quiet card. */
export const FieldsetStyle = app.forSlots(FieldsetSlots)(
  {
    fieldset: [
      {
        margin: '0',
        padding: t.space.md,
        border: `${t.border.thin} solid ${t.outline.subtle}`,
        borderRadius: t.radius.lg,
        background: t.surface.subtle,
      },
    ],
    legend: [U.m('0'), U.text('sm'), U.font('semibold'), U.color('text.overt')],
    description: [U.m('0'), U.text('sm'), U.color('text.muted')],
  },
  { name: 'FieldsetStyle' },
)

/** Radio options as pills; the chosen one takes the accent tint and ink. */
export const RadioStyle = app.forSlots(RadioGroupSlots)(
  {
    group: [L.in('layouts', Layout.cluster({ gap: t.space['2xs'], align: 'center' }))],
    option: [
      U.text('sm'),
      U.font('medium'),
      {
        padding: `${t.space['2xs']} ${t.space.sm}`,
        border: `${t.border.thin} solid ${t.outline.default}`,
        borderRadius: t.radius.full,
        background: 'transparent',
        color: t.text.muted,
        font: 'inherit',
        cursor: 'pointer',
      },
      Style.pseudo(':hover', { color: t.text.overt }),
      Style.pseudo('[aria-selected="true"]', {
        background: t.accent.subtle,
        borderColor: 'transparent',
        color: t.accent.ink,
      }),
    ],
    label: [U.m('0'), U.text('sm'), U.font('medium'), U.color('text.overt')],
    description: [U.m('0'), U.text('sm'), U.color('text.muted')],
  },
  { name: 'RadioStyle' },
)

/**
 * A volume-style slider preview. Geometry (fill width, thumb position) is
 * left to the view's inline style; the style owns the track, fill, and
 * thumb looks only.
 */
export const SliderStyle = app.forSlots(SliderSlots)(
  {
    root: [L.in('layouts', Layout.stack({ gap: t.space['2xs'] })), { maxWidth: '20rem' }],
    track: [
      {
        position: 'relative',
        blockSize: '0.375rem',
        borderRadius: t.radius.full,
        background: t.surface.muted,
      },
    ],
    filledTrack: [
      {
        position: 'absolute',
        insetBlock: '0',
        insetInlineStart: '0',
        borderRadius: t.radius.full,
        background: t.accent.default,
      },
    ],
    thumb: [
      {
        position: 'absolute',
        insetBlockStart: '50%',
        blockSize: '1rem',
        inlineSize: '1rem',
        borderRadius: t.radius.full,
        background: t.surface.base,
        border: `${t.border.thick} solid ${t.accent.default}`,
        translate: '-50% -50%',
      },
    ],
    label: [U.m('0'), U.text('sm'), U.font('medium'), U.color('text.overt')],
  },
  { name: 'SliderStyle' },
)

/**
 * Every calendar mode: the day grid stacks its weeks (it carries
 * `aria-rowcount`), while the month and year pickers share a three-by-four
 * grid. Cell buttons read their state off the cell: today, selected, focused,
 * disabled, or outside the shown month.
 */
export const CalendarStyle = app.forSlots(CalendarSlots)(
  {
    root: [
      {
        display: 'inline-block',
        padding: t.space.md,
        border: `${t.border.thin} solid ${t.outline.subtle}`,
        borderRadius: t.radius.lg,
        background: t.surface.base,
        boxShadow: t.shadow.sm,
      },
    ],
    previousMonthButton: [
      U.text('sm'),
      {
        inlineSize: '2rem',
        blockSize: '2rem',
        border: '0',
        borderRadius: t.radius.md,
        background: 'transparent',
        color: t.text.muted,
        font: 'inherit',
        cursor: 'pointer',
      },
      Style.pseudo(':hover', { background: t.surface.muted, color: t.text.overt }),
    ],
    nextMonthButton: [
      U.text('sm'),
      {
        inlineSize: '2rem',
        blockSize: '2rem',
        border: '0',
        borderRadius: t.radius.md,
        background: 'transparent',
        color: t.text.muted,
        font: 'inherit',
        cursor: 'pointer',
      },
      Style.pseudo(':hover', { background: t.surface.muted, color: t.text.overt }),
    ],
    headingButton: [
      U.text('sm'),
      U.font('semibold'),
      {
        padding: `${t.space['2xs']} ${t.space.xs}`,
        border: '0',
        borderRadius: t.radius.md,
        background: 'transparent',
        color: t.text.overt,
        font: 'inherit',
        cursor: 'pointer',
      },
      Style.pseudo(':hover', { background: t.surface.muted }),
    ],
    previousPageButton: [
      U.text('sm'),
      {
        inlineSize: '2rem',
        blockSize: '2rem',
        border: '0',
        borderRadius: t.radius.md,
        background: 'transparent',
        color: t.text.muted,
        font: 'inherit',
        cursor: 'pointer',
      },
      Style.pseudo(':hover', { background: t.surface.muted, color: t.text.overt }),
    ],
    nextPageButton: [
      U.text('sm'),
      {
        inlineSize: '2rem',
        blockSize: '2rem',
        border: '0',
        borderRadius: t.radius.md,
        background: 'transparent',
        color: t.text.muted,
        font: 'inherit',
        cursor: 'pointer',
      },
      Style.pseudo(':hover', { background: t.surface.muted, color: t.text.overt }),
    ],
    grid: [
      {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'repeat(4, 1fr)',
        gap: t.space['3xs'],
      },
      Style.pseudo('[aria-rowcount]', { display: 'flex', flexDirection: 'column' }),
    ],
    headerRow: [{ display: 'grid', gridTemplateColumns: 'repeat(7, 2rem)', gap: t.space['3xs'] }],
    columnHeader: [U.text('xs'), U.color('text.muted'), { textAlign: 'center' }],
    weekRow: [{ display: 'grid', gridTemplateColumns: 'repeat(7, 2rem)', gap: t.space['3xs'] }],
    dayCell: [{ display: 'grid', placeItems: 'center' }],
    dayButton: [
      U.text('sm'),
      {
        inlineSize: '2rem',
        blockSize: '2rem',
        border: '0',
        borderRadius: t.radius.full,
        background: 'transparent',
        color: t.text.default,
        font: 'inherit',
        fontVariantNumeric: 'tabular-nums',
        cursor: 'pointer',
      },
      Style.pseudo(':hover', { background: t.surface.muted }),
      Style.nest('[data-today] > &', { boxShadow: `0 0 0 1px ${t.outline.overt}` }),
      Style.nest('[data-outside-month] > &', { color: t.text.muted }),
      Style.nest('[data-selected] > &, [data-selected] > &:hover', {
        background: t.accent.default,
        color: t.accent['on-fill'],
      }),
      Style.nest('[data-focused] > &', {
        outline: `${t.border.thick} solid ${t.accent.default}`,
        outlineOffset: '2px',
      }),
      Style.nest('[data-disabled] > &', { opacity: '0.4', cursor: 'not-allowed' }),
    ],
    monthCell: [{ display: 'grid', placeItems: 'center' }],
    monthButton: [
      U.text('sm'),
      {
        inlineSize: '100%',
        paddingBlock: t.space.xs,
        border: '0',
        borderRadius: t.radius.md,
        background: 'transparent',
        color: t.text.default,
        font: 'inherit',
        cursor: 'pointer',
      },
      Style.pseudo(':hover', { background: t.surface.muted }),
      Style.nest('[data-selected] > &, [data-selected] > &:hover', {
        background: t.accent.default,
        color: t.accent['on-fill'],
      }),
      Style.nest('[data-focused] > &', {
        outline: `${t.border.thick} solid ${t.accent.default}`,
        outlineOffset: '2px',
      }),
      Style.nest('[data-disabled] > &', { opacity: '0.4', cursor: 'not-allowed' }),
    ],
    yearCell: [{ display: 'grid', placeItems: 'center' }],
    yearButton: [
      U.text('sm'),
      {
        inlineSize: '100%',
        paddingBlock: t.space.xs,
        border: '0',
        borderRadius: t.radius.md,
        background: 'transparent',
        color: t.text.default,
        font: 'inherit',
        fontVariantNumeric: 'tabular-nums',
        cursor: 'pointer',
      },
      Style.pseudo(':hover', { background: t.surface.muted }),
      Style.nest('[data-selected] > &, [data-selected] > &:hover', {
        background: t.accent.default,
        color: t.accent['on-fill'],
      }),
      Style.nest('[data-focused] > &', {
        outline: `${t.border.thick} solid ${t.accent.default}`,
        outlineOffset: '2px',
      }),
      Style.nest('[data-disabled] > &', { opacity: '0.4', cursor: 'not-allowed' }),
    ],
  },
  { name: 'CalendarStyle' },
)

// --- overlay previews ------------------------------------------------------------------
// Popover, Tooltip, and HoverIntent are Submodels; the demo draws their slots
// statically (trigger plus panel in place), so the section shows the look
// while the state stays two booleans in the Model.

/** A floating card with a shadow, drawn in place for the preview. */
export const PopoverStyle = app.forSlots(PopoverSlots)(
  {
    button: [
      U.text('sm'),
      U.font('medium'),
      {
        padding: `${t.space.xs} ${t.space.md}`,
        border: `${t.border.thin} solid ${t.outline.default}`,
        borderRadius: t.radius.md,
        background: 'transparent',
        color: t.text.default,
        font: 'inherit',
        cursor: 'pointer',
      },
      Style.pseudo(':hover', { background: t.surface.muted }),
    ],
    panel: [
      {
        padding: t.space.md,
        maxWidth: '18rem',
        border: `${t.border.thin} solid ${t.outline.subtle}`,
        borderRadius: t.radius.lg,
        background: t.surface.base,
        boxShadow: t.shadow.lg,
        color: t.text.muted,
        zIndex: '20',
      },
    ],
    backdrop: [{ position: 'fixed', inset: '0' }],
  },
  { name: 'PopoverStyle' },
)

/** A dark pill, as tooltips read on any ground. */
export const TooltipStyle = app.forSlots(TooltipSlots)(
  {
    trigger: [
      U.text('sm'),
      U.font('medium'),
      {
        padding: '0',
        border: '0',
        background: 'transparent',
        color: t.text.default,
        font: 'inherit',
        textDecoration: 'underline dotted',
        textUnderlineOffset: '3px',
        cursor: 'default',
      },
    ],
    panel: [
      U.text('xs'),
      {
        display: 'inline-block',
        marginInlineStart: t.space.xs,
        padding: `${t.space['3xs']} ${t.space.xs}`,
        borderRadius: t.radius.md,
        background: t.text.overt,
        color: t.surface.base,
      },
    ],
  },
  { name: 'TooltipStyle' },
)

/** A hover card: a trigger with its panel beside it, both drawn in place. */
export const HoverCardStyle = app.forSlots(HoverIntentSlots)(
  {
    trigger: [
      U.text('sm'),
      U.font('medium'),
      {
        padding: `${t.space['2xs']} ${t.space.sm}`,
        border: `${t.border.thin} solid ${t.outline.default}`,
        borderRadius: t.radius.full,
        background: t.surface.subtle,
        color: t.text.default,
        font: 'inherit',
        cursor: 'default',
      },
    ],
    panel: [
      U.text('sm'),
      {
        marginBlockStart: t.space.xs,
        padding: t.space.md,
        maxWidth: '18rem',
        border: `${t.border.thin} solid ${t.outline.subtle}`,
        borderRadius: t.radius.lg,
        background: t.surface.base,
        boxShadow: t.shadow.md,
        color: t.text.muted,
      },
    ],
  },
  { name: 'HoverCardStyle' },
)

// --- pickers: menu, listbox, combobox -------------------------------------------------
// None of these ships a recipe, so each is styled here in the shadcn skin:
// a bordered panel under the trigger, rows that tint when chosen.

const popupPanel = [
  {
    marginBlockStart: t.space['2xs'],
    minInlineSize: '14rem',
    padding: t.space['2xs'],
    border: `${t.border.thin} solid ${t.outline.subtle}`,
    borderRadius: t.radius.lg,
    background: t.surface.base,
    boxShadow: t.shadow.lg,
    // Floating panels paint above later page content (and its positioned
    // wrappers); the sticky nav and toasts sit above them.
    zIndex: '20',
  },
]

const popupRow = [
  U.text('sm'),
  {
    display: 'block',
    inlineSize: '100%',
    boxSizing: 'border-box',
    padding: `${t.space['2xs']} ${t.space.sm}`,
    border: '0',
    borderRadius: t.radius.md,
    background: 'transparent',
    color: t.text.default,
    font: 'inherit',
    textAlign: 'start',
    cursor: 'pointer',
  },
  Style.pseudo(':hover', { background: t.surface.muted }),
]

export const MenuStyle = app.forSlots(MenuSlots)(
  {
    wrapper: [{ position: 'relative', display: 'inline-block' }],
    button: [
      U.text('sm'),
      U.font('medium'),
      {
        display: 'inline-flex',
        alignItems: 'center',
        gap: t.space.xs,
        padding: `${t.space.xs} ${t.space.md}`,
        border: `${t.border.thin} solid ${t.outline.default}`,
        borderRadius: t.radius.md,
        background: 'transparent',
        color: t.text.default,
        font: 'inherit',
        cursor: 'pointer',
      },
      Style.pseudo(':hover', { background: t.surface.muted }),
    ],
    backdrop: [{ position: 'fixed', inset: '0' }],
    items: popupPanel,
    item: [
      ...popupRow,
      Style.pseudo('[aria-disabled="true"]', { opacity: '0.5', cursor: 'not-allowed' }),
    ],
    heading: [
      U.m('0'),
      U.text('xs'),
      U.font('semibold'),
      U.color('text.muted'),
      { padding: `${t.space['2xs']} ${t.space.sm}`, textTransform: 'uppercase' },
    ],
    separator: [
      {
        marginBlock: t.space['2xs'],
        borderBlockStart: `${t.border.thin} solid ${t.outline.subtle}`,
      },
    ],
  },
  { name: 'MenuStyle' },
)

export const ListboxStyle = app.forSlots(ListboxSlots)(
  {
    wrapper: [{ position: 'relative', display: 'inline-block', minInlineSize: '14rem' }],
    button: [
      {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: t.space.sm,
        inlineSize: '100%',
        padding: `${t.space.xs} 2rem ${t.space.xs} ${t.space.sm}`,
        border: `${t.border.thin} solid ${t.outline.default}`,
        borderRadius: t.radius.md,
        background: t.surface.base,
        color: t.text.default,
        font: 'inherit',
        lineHeight: t.leading.normal,
        appearance: 'none',
        cursor: 'pointer',
      },
      Style.pseudo(':hover:not(:focus, :disabled)', { borderColor: t.outline.overt }),
    ],
    backdrop: [{ position: 'fixed', inset: '0' }],
    items: popupPanel,
    item: [
      ...popupRow,
      Style.pseudo('[aria-selected="true"]', { background: t.accent.subtle, color: t.accent.ink }),
    ],
  },
  { name: 'ListboxStyle' },
)

export const ComboBoxStyle = app.forSlots(ComboboxSlots)(
  {
    wrapper: [{ position: 'relative', display: 'inline-block', minInlineSize: '14rem' }],
    inputWrapper: [
      {
        display: 'flex',
        alignItems: 'center',
        border: `${t.border.thin} solid ${t.outline.default}`,
        borderRadius: t.radius.md,
        background: t.surface.base,
      },
      Style.pseudo(':hover:not(:focus-within)', { borderColor: t.outline.overt }),
      Style.pseudo(':focus-within', {
        outline: `${t.border.thick} solid ${t.outline.focus}`,
        outlineOffset: '2px',
      }),
    ],
    input: [
      {
        flex: '1',
        minInlineSize: '0',
        padding: `${t.space.xs} ${t.space.sm}`,
        border: '0',
        background: 'transparent',
        color: t.text.default,
        font: 'inherit',
        lineHeight: t.leading.normal,
      },
      Style.pseudo(':focus-visible', { outline: 'none' }),
    ],
    toggleButton: [
      U.text('sm'),
      {
        padding: `${t.space.xs} ${t.space.sm}`,
        border: '0',
        background: 'transparent',
        color: t.text.muted,
        font: 'inherit',
        cursor: 'pointer',
      },
      Style.pseudo(':hover', { color: t.text.overt }),
    ],
    backdrop: [{ position: 'fixed', inset: '0' }],
    items: popupPanel,
    item: [
      ...popupRow,
      Style.pseudo('[aria-selected="true"]', { background: t.accent.subtle, color: t.accent.ink }),
    ],
  },
  { name: 'ComboBoxStyle' },
)

// --- date chrome: the picker shell rides attribute bundles ---------------------------
// The DatePicker adapter resolves in the child's own Message universe, so a
// parent draws its shell through these slots instead: the month grid inside
// still resolves through CalendarSlots.

export const DateChromeSlots = Slots.define({
  picker: Slot.make({ capability: Capability.Container }),
  trigger: Slot.make({ capability: Capability.Container }),
  panel: Slot.make({ capability: Capability.Container }),
  backdrop: Slot.make({ capability: Capability.Container }),
  header: Slot.make({ capability: Capability.Container }),
  monthHeader: Slot.make({ capability: Capability.Container }),
})

export const DateChromeStyle = app.slots(
  {
    picker: [{ position: 'relative', display: 'inline-block' }],
    trigger: [
      U.text('sm'),
      {
        display: 'inline-flex',
        alignItems: 'center',
        gap: t.space.xs,
        padding: `${t.space.xs} ${t.space.md}`,
        border: `${t.border.thin} solid ${t.outline.default}`,
        borderRadius: t.radius.md,
        background: t.surface.base,
        color: t.text.default,
        font: 'inherit',
        cursor: 'pointer',
      },
      Style.pseudo(':hover', { borderColor: t.outline.overt }),
    ],
    panel: [...popupPanel, { minInlineSize: '18rem' }],
    backdrop: [{ position: 'fixed', inset: '0' }],
    header: [
      L.in('layouts', Layout.cluster({ justify: 'space-between', align: 'center' })),
      { marginBlockEnd: t.space['2xs'] },
    ],
    monthHeader: [
      L.in('layouts', Layout.cluster({ justify: 'center', align: 'center' })),
      { marginBlockEnd: t.space['2xs'] },
    ],
  },
  { name: 'DateChromeStyle' },
)

// --- toast + file drop -------------------------------------------------------------------

export const ToastStyle = app.forSlots(ToastSlots)(
  {
    container: [
      L.in('layouts', Layout.stack({ gap: t.space.sm })),
      {
        position: 'fixed',
        insetBlockEnd: t.space.lg,
        insetInlineEnd: t.space.lg,
        inlineSize: 'min(22rem, calc(100vw - 2rem))',
        zIndex: '50',
      },
    ],
    entry: [
      {
        padding: t.space.md,
        border: `${t.border.thin} solid ${t.outline.subtle}`,
        borderInlineStart: `${t.border.thick} solid ${t.accent.default}`,
        borderRadius: t.radius.lg,
        background: t.surface.base,
        boxShadow: t.shadow.lg,
      },
    ],
  },
  { name: 'ToastStyle' },
)

export const ToastEntrySlots = Slots.define({
  title: Slot.make({ capability: Capability.Container }),
  text: Slot.make({ capability: Capability.Container }),
  dismiss: Slot.make({ capability: Capability.Container }),
})

export const ToastEntryStyle = app.slots(
  {
    title: [U.m('0'), U.text('sm'), U.font('semibold'), U.color('text.overt')],
    text: [U.m('0'), U.text('sm'), U.color('text.muted')],
    dismiss: [
      U.text('sm'),
      U.font('medium'),
      {
        padding: '0',
        border: '0',
        background: 'transparent',
        color: t.text.muted,
        cursor: 'pointer',
      },
      Style.pseudo(':hover', { color: t.text.overt }),
    ],
  },
  { name: 'ToastEntryStyle' },
)

export const FileDropStyle = app.forSlots(FileDropSlots)(
  {
    root: [
      L.in('layouts', Layout.stack({ gap: t.space['2xs'], align: 'center' })),
      {
        padding: t.space.xl,
        border: `${t.border.thin} dashed ${t.outline.default}`,
        borderRadius: t.radius.lg,
        background: t.surface.subtle,
        color: t.text.muted,
        textAlign: 'center',
        cursor: 'pointer',
      },
      Style.pseudo(':hover', { borderColor: t.outline.overt }),
      Style.pseudo('[data-drag-over="true"]', {
        borderColor: t.accent.default,
        background: t.accent.subtle,
        color: t.accent.ink,
      }),
      // The input keeps its component-owned class, which a mixin class does
      // not survive beside (only the base class reaches the element), so the
      // visually-hidden treatment hangs off the root instead.
      Style.nest('& > input', {
        position: 'absolute',
        inlineSize: '1px',
        blockSize: '1px',
        overflow: 'hidden',
        clipPath: 'inset(50%)',
      }),
    ],
  },
  { name: 'FileDropStyle' },
)

export const FileTextSlots = Slots.define({
  primary: Slot.make({ capability: Capability.Container }),
  secondary: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Container }),
  fileName: Slot.make({ capability: Capability.Container }),
})

export const FileTextStyle = app.slots(
  {
    primary: [U.m('0'), U.text('sm'), U.font('medium'), U.color('text.overt')],
    secondary: [U.m('0'), U.text('sm'), U.color('text.muted')],
    row: [L.in('layouts', Layout.cluster({ gap: t.space.sm, align: 'center' }))],
    fileName: [U.text('sm'), U.font('medium'), U.color('text.default')],
  },
  { name: 'FileTextStyle' },
)

// --- input group, icons, touch -----------------------------------------------------------

export const InputGroupSlots = Slots.define({
  group: Slot.make({ capability: Capability.Container }),
  affix: Slot.make({ capability: Capability.Container }),
  control: Slot.make({ capability: Capability.TextInput, events: [] }),
})

/** A text field with a prefix, drawn as one box. */
export const InputGroupStyle = app.slots(
  {
    group: [Recipes.InputGroup.group],
    affix: [Recipes.InputGroup.affix],
    control: [
      Recipes.InputGroup.control,
      {
        paddingBlock: t.space.xs,
        paddingInlineEnd: t.space.sm,
        font: 'inherit',
        color: t.text.default,
      },
    ],
  },
  { name: 'InputGroupStyle' },
)

export const IconSlots = Slots.define({
  row: Slot.make({ capability: Capability.Container }),
  chip: Slot.make({ capability: Capability.Container }),
})

const iconUrl = (shape: string): string =>
  `url('data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 16 16%27>${shape}</svg>')`

/**
 * `Icons` + `Touch` as mechanisms: each chip shows the icon its `data-icon`
 * names, and every chip is a 44px target where the pointer is coarse.
 */
export const IconStyle = app.slots(
  {
    row: [L.in('layouts', Layout.cluster({ gap: t.space.sm, align: 'center' }))],
    chip: [
      Touch.target,
      Icons.glyph('1rem'),
      Icons.byAttribute('data-icon', {
        dot: iconUrl('<circle cx=%278%27 cy=%278%27 r=%276%27 fill=%27black%27/>'),
        star: iconUrl(
          '<path d=%27M8 1l2.2 4.8 5.3.6-3.9 3.6 1 5.2-4.6-2.6-4.6 2.6 1-5.2L.5 6.4l5.3-.6z%27 fill=%27black%27/>',
        ),
      }),
      U.text('sm'),
      {
        display: 'inline-flex',
        alignItems: 'center',
        gap: t.space['2xs'],
        padding: `${t.space['2xs']} ${t.space.sm}`,
        border: `${t.border.thin} solid ${t.outline.subtle}`,
        borderRadius: t.radius.full,
        color: t.text.muted,
      },
    ],
  },
  { name: 'IconStyle' },
)

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
