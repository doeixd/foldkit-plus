/**
 * The job application's appearance, as `foldkit-mixins` data. The views
 * draw the markup through the Slots declared here; everything it looks
 * like lives here.
 *
 * `AppStyle` compiles every style into the `app` layer, the last of the
 * standard order, so it overrides the shipped recipes and the `Layout`
 * pieces by layer order rather than by specificity.
 */
import { Capability, Event, Style, type Declarations, type StyleValue } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities as U } from 'foldkit-mixins/utilities'
import {
  ButtonSlots,
  CalendarSlots,
  CheckboxSlots,
  InputSlots,
  RadioGroupSlots,
  Recipes,
  TabsSlots,
  TextareaSlots,
} from 'foldkit-mixins-ui'
import * as FieldValidation from 'foldkit/fieldValidation'

// THEME

/** Indigo, as upstream's Tailwind `indigo-600`, over grey surfaces. */
const oklchPalette = Theme.oklch({
  accent: { h: 277, c: 0.24, l: '51%' },
  surfaceSaturation: 0.004,
})

/**
 * A feedback color washed over the base surface, mixed in sRGB. `Theme.oklch`
 * mixes its `subtle` in oklch, where the surface's hue (the accent's) pulls a
 * green or a red toward indigo: its success banner came out blue.
 */
const wash = (family: 'success' | 'error'): string => {
  const colors = Theme.ref(oklchPalette)
  return `color-mix(in srgb, ${colors.surface.base} 88%, ${colors[family].default})`
}

/**
 * A white base, so the cards stand out from the page's `surface.muted`, and the
 * feedback washes in their own hue.
 */
const { t, L, slots, forSlots, stylesheet } = AppStyle.make({
  palette: Theme.compose(
    oklchPalette,
    Theme.define({
      knob: { 'base-l': '100%' },
      success: { subtle: wash('success') },
      error: { subtle: wash('error') },
    }),
  ),
  colorScheme: 'light',
})

export { stylesheet }

/**
 * The two widths the layout turns at, named once: the step tabs replace the
 * step menu at `wide`, and the preview sidebar replaces its toggle at `wider`.
 */
const wide = Theme.tokens.breakpoint.lg
const wider = Theme.tokens.breakpoint.xl

const shownFrom = (query: string, display: string): StyleValue =>
  Style.compose(Style.self({ display: 'none' }), Style.media(query, { display }))

const hiddenFrom = (query: string): StyleValue => Style.media(query, { display: 'none' })

const card = (declarations: Declarations = {}): StyleValue =>
  Style.self({
    boxSizing: 'border-box',
    border: `${t.border.thin} solid ${t.outline.subtle}`,
    borderRadius: t.radius.lg,
    background: t.surface.base,
    ...declarations,
  })

const floating = '0 10px 15px -3px rgb(0 0 0 / 10%), 0 4px 6px -4px rgb(0 0 0 / 10%)'

const text = (size: string, color: string, declarations: Declarations = {}): StyleValue =>
  Style.self({ margin: '0', fontSize: size, color, ...declarations })

const label = text(t.size.sm, t.text.subtle, { display: 'block', fontWeight: t.weight.medium })

const chevron = Style.self({
  flexShrink: '0',
  width: '1rem',
  height: '1rem',
  color: t.text.muted,
})

const spin = Style.keyframes({ to: { transform: 'rotate(360deg)' } })

/** A control's text box: the trigger of a picker, and the text inputs. */
const box = Style.self({
  boxSizing: 'border-box',
  width: '100%',
  paddingBlock: t.space.xs,
  paddingInline: t.space.sm,
  border: `${t.border.thin} solid ${t.outline.default}`,
  borderRadius: t.radius.lg,
  background: t.surface.base,
  fontSize: t.size.sm,
  color: t.text.overt,
})

const focusRing = Style.pseudo(':focus-visible', {
  outline: `${t.border.thick} solid ${t.accent.default}`,
  outlineOffset: '0',
})

/** Hidden but still reachable by a label and a screen reader. */
const visuallyHidden: Declarations = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: '0',
}

// PAGE

export const JobPage = slots(
  {
    page: [U.bg('surface.muted'), { minHeight: '100vh' }],
    container: [
      {
        boxSizing: 'border-box',
        maxWidth: '80rem',
        marginInline: 'auto',
        paddingBlock: t.space.xl,
        paddingInline: t.space.md,
      },
      Style.media(Theme.tokens.breakpoint.sm, { paddingInline: t.space.lg }),
      Style.media(wide, { paddingInline: t.space.xl }),
    ],
    header: { marginBlockEnd: t.space.lg },
    title: text(t.size['2xl'], t.text.overt, { fontWeight: t.weight.bold }),
    subtitle: text(t.size.sm, t.text.muted, { marginBlockStart: t.space['2xs'] }),
    // The step menu, shown until the tabs have room.
    stepMenu: [{ marginBlockEnd: t.space.lg }, hiddenFrom(wide)],
    layout: Style.media(wide, { display: 'flex', gap: t.space.xl }),
    sidebar: [shownFrom(wide, 'block'), { width: '15rem', flexShrink: '0' }],
    sticky: Style.self({ position: 'sticky', top: t.space.xl }),
    stepHeading: text(t.size.lg, t.text.overt, {
      marginBlockEnd: t.space.lg,
      fontWeight: t.weight.semibold,
    }),
    stepBody: Style.self({ minHeight: '400px' }),
    navigation: [
      U.flex,
      U.justify('between'),
      {
        marginBlockStart: t.space.xl,
        paddingBlockStart: t.space.lg,
        borderBlockStart: `${t.border.thin} solid ${t.outline.subtle}`,
      },
    ],
    previewSidebar: [shownFrom(wider, 'block'), { width: '20rem', flexShrink: '0' }],
    previewHeading: text(t.size.sm, t.text.subtle, {
      marginBlockEnd: t.space.xs,
      fontWeight: t.weight.semibold,
    }),
    previewCard: card({
      padding: t.space.lg,
      borderRadius: t.radius.xl,
      boxShadow: '0 1px 2px 0 rgb(0 0 0 / 5%)',
    }),
    // The preview toggle, shown until the preview sidebar has room.
    previewDock: [
      {
        position: 'fixed',
        top: t.space.md,
        right: t.space.md,
        zIndex: '20',
      },
      hiddenFrom(wider),
    ],
    previewOverlay: [
      card({
        position: 'fixed',
        insetInline: t.space.md,
        top: '4rem',
        bottom: t.space.md,
        zIndex: '20',
        overflowY: 'auto',
        padding: t.space.lg,
        borderRadius: t.radius.xl,
        boxShadow: '0 25px 50px -12px rgb(0 0 0 / 25%)',
      }),
      hiddenFrom(wider),
    ],
  },
  { name: 'PageStyle' },
)

// STEP NAVIGATION

/**
 * Where a step stands, as `data-status` on its tab, menu item and marker: the
 * one shown, one before it, or one after it. `data-attention` marks a step
 * with an error, or one still incomplete once a submit was tried; it wins.
 */
const statusColors = (
  colors: Readonly<Record<'Current' | 'Completed' | 'Upcoming' | 'attention', Declarations>>,
): StyleValue =>
  Style.compose(
    Style.states(
      { Current: colors.Current, Completed: colors.Completed, Upcoming: colors.Upcoming },
      'data-status',
    ),
    Style.pseudo('[data-attention]', colors.attention),
  )

export const StepTabsStyle = forSlots(TabsSlots)(
  {
    tablist: L.in('layouts', Layout.stack({ gap: '0.125rem' })),
    tab: [
      U.text('sm'),
      U.font('medium'),
      {
        boxSizing: 'border-box',
        display: 'flex',
        width: '100%',
        alignItems: 'center',
        gap: t.space.sm,
        paddingBlock: t.space.xs,
        paddingInline: t.space.sm,
        border: '0',
        borderRadius: t.radius.md,
        background: 'transparent',
        font: 'inherit',
        textAlign: 'start',
        cursor: 'pointer',
      },
      Style.pseudo(':hover', { background: t.surface.subtle }),
      statusColors({
        Current: { background: t.accent.subtle, color: t.accent.ink, cursor: 'default' },
        Completed: { color: t.text.subtle },
        Upcoming: { color: t.text.muted },
        attention: { background: 'transparent', color: t.error.ink, cursor: 'pointer' },
      }),
      Style.pseudo('[data-attention]:hover', { background: t.error.subtle }),
      focusRing,
    ],
    panel: Style.self({ flex: '1', minWidth: '0' }),
  },
  { name: 'StepTabsStyle' },
)

export const StepNavPart = slots(
  {
    marker: [
      U.flex,
      {
        flexShrink: '0',
        width: '1.5rem',
        height: '1.5rem',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: t.radius.full,
        fontSize: '11px',
        fontWeight: t.weight.semibold,
      },
      statusColors({
        Current: { background: t.accent.default, color: t.accent['on-fill'] },
        Completed: { background: t.accent.subtle, color: t.accent.ink },
        Upcoming: { background: t.surface.subtle, color: t.text.muted },
        attention: { background: t.error.subtle, color: t.error.ink },
      }),
    ],
    stepName: Style.self({}),
    menu: { position: 'relative' },
    menuButton: [
      card({
        display: 'flex',
        width: '100%',
        alignItems: 'center',
        paddingBlock: t.space.sm,
        paddingInline: t.space.md,
        font: 'inherit',
        textAlign: 'start',
        cursor: 'pointer',
        boxShadow: '0 1px 2px 0 rgb(0 0 0 / 5%)',
      }),
      Style.pseudo(':hover', { borderColor: t.outline.default }),
      focusRing,
    ],
    menuTrigger: [U.flex, U.items('center'), U.justify('between'), U.gap('sm'), { width: '100%' }],
    menuTriggerText: [U.flex, U.items('center'), U.gap('xs'), { minWidth: '0' }],
    menuStepCount: text(t.size.xs, t.text.muted, { flexShrink: '0', fontWeight: t.weight.medium }),
    menuStepName: text(t.size.sm, t.text.overt, {
      overflow: 'hidden',
      fontWeight: t.weight.semibold,
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }),
    // `@foldkit/ui` Menu takes only a class name per item, so the items are
    // styled from their container, by the role and the `data-active` it writes.
    menuItems: [
      card({
        zIndex: '10',
        width: 'var(--button-width)',
        paddingBlock: t.space['2xs'],
        boxShadow: floating,
        outline: 'none',
      }),
      Style.nest('[role="menuitem"]', { cursor: 'pointer' }),
      Style.nest('[data-active]', { background: t.surface.muted }),
    ],
    menuItem: [
      U.flex,
      U.items('center'),
      U.gap('sm'),
      U.text('sm'),
      {
        paddingBlock: '0.625rem',
        paddingInline: t.space.md,
      },
      statusColors({
        Current: { color: t.accent.ink, fontWeight: t.weight.semibold },
        Completed: { color: t.text.subtle },
        Upcoming: { color: t.text.muted },
        attention: { color: t.error.ink, fontWeight: t.weight.semibold },
      }),
    ],
    menuBackdrop: Style.self({ position: 'fixed', inset: '0' }),
    chevron,
  },
  { name: 'StepNavStyle' },
)

// FIELDS

type FieldState = FieldValidation.Field<string>

/** What a field's border says about it, as upstream's `borderClass` does. */
type Tone = 'idle' | 'checking' | 'valid' | 'invalid'

const toneOf = (field: FieldState): Tone =>
  FieldValidation.match(field, {
    onNotValidated: () => 'idle',
    onValidating: () => 'checking',
    onValid: () => 'valid',
    onInvalid: () => 'invalid',
  })

const whenTone = (tone: Tone, piece: StyleValue): StyleValue =>
  Style.whenInput<FieldState>(field => toneOf(field) === tone, piece)

export const FieldPart = slots(
  {
    field: L.in('layouts', Layout.stack({ gap: t.space['2xs'] })),
    header: L.in('layouts', Layout.cluster({ gap: t.space.xs, align: 'center' })),
    // Upstream asks Tailwind to spin an inline span, which a transform leaves
    // still; an inline-block turns.
    // Beside a label while the email is being checked.
    checkingMark: [
      spin.style,
      U.text('sm'),
      {
        display: 'inline-block',
        color: t.info.ink,
        animation: `${spin.name} 1s linear infinite`,
      },
    ],
    // Beside a label once its field is valid.
    validMark: text(t.size.sm, t.success.ink),
    checkboxRow: L.in('layouts', Layout.cluster({ gap: t.space.xs, align: 'center' })),
  },
  { name: 'FieldStyle' },
)

/** The border follows the field, as upstream's `borderClass` does. */
const control: StyleValue = Style.compose(
  box,
  whenTone('checking', Style.self({ borderColor: t.info.default })),
  whenTone('valid', Style.self({ borderColor: t.success.default })),
  whenTone('invalid', Style.self({ borderColor: t.error.default })),
)

const error = text(t.size.sm, t.error.ink, { display: 'block' })

/** The shipped text-field recipe, its border following the field's state. */
export const InputStyle = forSlots(InputSlots)(
  Recipes.Input.extend({ base: { input: control, label, description: error } })(),
  { name: 'InputStyle' },
)

export const TextareaStyle = forSlots(TextareaSlots)(
  Recipes.Textarea.extend({
    // The reset sizes a textarea to its content; upstream's are as tall as their `rows`.
    base: {
      textarea: Style.compose(box, Style.self({ resize: 'vertical', fieldSizing: 'fixed' })),
      label,
    },
  })(),
  { name: 'TextareaStyle' },
)

export const CheckboxStyle = forSlots(CheckboxSlots)(
  Recipes.Checkbox.extend({
    base: { label: text(t.size.sm, t.text.subtle, { cursor: 'pointer', userSelect: 'none' }) },
  })(),
  { name: 'CheckboxStyle' },
)

// CHOICES

/** A Listbox of choices: the pronouns and the graduation year. */
export const ChoicePart = slots(
  {
    field: L.in('layouts', Layout.stack({ gap: t.space['2xs'] })),
    label,
    choice: { position: 'relative' },
    button: [
      box,
      U.text('sm'),
      { font: 'inherit', textAlign: 'start', cursor: 'pointer' },
      focusRing,
    ],
    face: [U.flex, U.items('center'), U.justify('between'), U.gap('xs'), { width: '100%' }],
    placeholder: { color: t.text.muted },
    value: { color: t.text.overt },
    // `@foldkit/ui` Listbox takes only a class name per option, so the options
    // are styled from their container, by the role and the `data-active` it writes.
    items: [
      card({
        zIndex: '10',
        width: 'var(--button-width)',
        maxHeight: '16rem',
        overflowY: 'auto',
        paddingBlock: t.space['2xs'],
        boxShadow: floating,
        outline: 'none',
      }),
      Style.nest('[role="option"]', {
        paddingBlock: t.space.xs,
        paddingInline: t.space.sm,
        fontSize: t.size.sm,
        color: t.text.default,
        cursor: 'pointer',
      }),
      Style.nest('[data-active]', { background: t.accent.subtle }),
      Style.nest('[data-selected]', { color: t.accent.ink, fontWeight: t.weight.semibold }),
    ],
    option: [U.flex, U.items('center'), U.gap('xs')],
    optionText: { overflow: 'hidden', textOverflow: 'ellipsis' },
    // Shown beside the option the Listbox marks `data-selected`.
    check: [
      {
        width: '1rem',
        color: t.accent.ink,
        visibility: 'hidden',
      },
      Style.nest('[data-selected] &', { visibility: 'visible' }),
    ],
    backdrop: Style.self({ position: 'fixed', inset: '0' }),
    chevron,
  },
  { name: 'ChoiceStyle' },
)

// DATE PICKER

export const DatePickerPart = slots(
  {
    field: L.in('layouts', Layout.stack({ gap: t.space['2xs'] })),
    label,
    picker: { position: 'relative' },
    trigger: [
      box,
      U.text('sm'),
      { font: 'inherit', textAlign: 'start', cursor: 'pointer' },
      focusRing,
    ],
    face: [U.flex, U.items('center'), U.justify('between'), U.gap('xs'), { width: '100%' }],
    placeholder: { color: t.text.muted },
    value: { color: t.text.overt },
    panel: card({
      zIndex: '10',
      padding: t.space.md,
      borderRadius: t.radius.xl,
      boxShadow: floating,
      outline: 'none',
    }),
    backdrop: Style.self({ position: 'fixed', inset: '0' }),
    chevron,
    // The row of the calendar's heading and its paging buttons.
    calendarBar: [U.flex, U.items('center'), U.justify('between'), U.gap('xs')],
    headingChevron: Style.self({ width: '0.75rem', height: '0.75rem' }),
    yearsHeading: text(t.size.sm, t.text.overt, {
      fontWeight: t.weight.semibold,
      fontVariantNumeric: 'tabular-nums',
    }),
  },
  { name: 'DatePickerStyle' },
)

const calendarButton = Style.compose(
  Style.self({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '0',
    borderRadius: t.radius.md,
    background: 'transparent',
    font: 'inherit',
    fontSize: t.size.sm,
    color: t.text.overt,
    fontVariantNumeric: 'tabular-nums',
    cursor: 'pointer',
  }),
  Style.pseudo(':hover', { background: t.surface.subtle }),
)

/**
 * A cell's day, month or year. `@foldkit/ui` marks the cell (`data-today`,
 * `data-selected`, ...), and the button inside is what shows it.
 */
const calendarChoice = (shape: Declarations): StyleValue =>
  Style.compose(
    calendarButton,
    Style.self(shape),
    Style.nest('[data-today] > &', { boxShadow: `0 0 0 1px ${t.outline.overt}` }),
    Style.nest('[data-selected] > &', {
      background: t.accent.default,
      color: t.accent['on-fill'],
    }),
    Style.nest('[data-focused] > &', {
      outline: `${t.border.thick} solid ${t.accent.default}`,
      outlineOffset: '2px',
    }),
    Style.nest('[data-outside-month] > &', { color: t.text.muted }),
    Style.nest('[data-disabled] > &', { opacity: '0.4', cursor: 'not-allowed' }),
  )

/**
 * Which grid the calendar shows, the input its style reads: the days' grid is
 * rows of weeks, the months' and years' a three by four grid.
 */
export type CalendarMode = 'Days' | 'Months' | 'Years'

const calendarGrid = Style.self({
  display: 'grid',
  flex: '1',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gridTemplateRows: 'repeat(4, 1fr)',
  gap: t.space['2xs'],
  outline: 'none',
})

const calendarCell = Style.self({ display: 'flex', alignItems: 'center', justifyContent: 'center' })

const calendarNavigation = Style.compose(
  calendarButton,
  Style.self({ width: '2rem', height: '2rem', color: t.text.subtle }),
)

export const CalendarStyle = forSlots(CalendarSlots)(
  {
    root: [
      U.column,
      U.gap('sm'),
      U.selectNone,
      {
        display: 'flex',
        minWidth: '248px',
        minHeight: '260px',
      },
    ],
    previousMonthButton: calendarNavigation,
    nextMonthButton: calendarNavigation,
    previousPageButton: calendarNavigation,
    nextPageButton: calendarNavigation,
    headingButton: [
      calendarButton,
      U.font('semibold'),
      U.py('2xs'),
      U.px('xs'),
      { gap: t.space.xs },
    ],
    grid: [
      Style.whenInput<CalendarMode>(
        mode => mode === 'Days',
        Style.self({ display: 'flex', flexDirection: 'column', gap: t.space['2xs'] }),
      ),
      Style.whenInput<CalendarMode>(mode => mode !== 'Days', calendarGrid),
    ],
    headerRow: [U.grid, U.gap('2xs'), { gridTemplateColumns: 'repeat(7, 1fr)' }],
    columnHeader: text(t.size.xs, t.text.muted, {
      paddingBlock: t.space['2xs'],
      textAlign: 'center',
      fontWeight: t.weight.medium,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
    }),
    weekRow: [U.grid, U.gap('2xs'), { gridTemplateColumns: 'repeat(7, 1fr)' }],
    dayCell: calendarCell,
    dayButton: calendarChoice({ width: '2rem', height: '2rem', borderRadius: t.radius.full }),
    monthCell: calendarCell,
    monthButton: calendarChoice({ width: '100%', height: '100%' }),
    yearCell: calendarCell,
    yearButton: calendarChoice({ width: '100%', height: '100%' }),
  },
  { name: 'CalendarStyle' },
)

// STEPS

export const StepPart = slots(
  {
    step: L.in('layouts', Layout.stack({ gap: t.space.md })),
    intro: text(t.size.sm, t.text.muted),
    // Two fields side by side.
    pair: [U.grid, U.gap('sm'), { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }],
    entries: Style.nest('& > * + *', {
      borderBlockStart: `${t.border.thin} solid ${t.outline.subtle}`,
    }),
    entry: [
      L.in('layouts', Layout.stack({ gap: t.space.md })),
      U.py('lg'),
      Style.pseudo(':first-child', { paddingBlockStart: '0' }),
    ],
    entryActions: [U.flex, U.justify('end')],
    // A labelled control that is not a text field: a picker, a choice.
    control: L.in('layouts', Layout.stack({ gap: t.space['2xs'] })),
    controlLabel: label,
  },
  { name: 'StepStyle' },
)

/** Each proficiency as a pill; the chosen one is `aria-checked`. */
export const ProficiencyStyle = forSlots(RadioGroupSlots)(
  {
    group: L.in('layouts', Layout.cluster({ gap: t.space.xs })),
    option: [
      U.text('sm'),
      U.color('text.muted'),
      U.rounded('full'),
      U.selectNone,
      U.pointer,
      {
        paddingBlock: t.space['2xs'],
        paddingInline: t.space.sm,
        border: `${t.border.thin} solid ${t.outline.default}`,
      },
      Style.pseudo(':hover', { borderColor: t.outline.overt }),
      Style.pseudo('[aria-checked="true"]', {
        borderColor: t.accent.default,
        background: t.accent.subtle,
        color: t.accent.ink,
      }),
      focusRing,
    ],
    label: Style.self({}),
  },
  { name: 'ProficiencyStyle' },
)

// COVER LETTER

/** How close the letter is to its limit, as `data-state` on the counter. */
export type LetterLength = 'Plenty' | 'Nearly' | 'Over'

export const CoverLetterPart = slots(
  {
    letter: L.in('layouts', Layout.stack({ gap: t.space.xs })),
    footer: [U.flex, U.justify('between'), U.text('sm')],
    hint: text(t.size.sm, t.text.muted),
    counter: Style.states({
      Plenty: { color: t.text.muted },
      Nearly: { color: t.warning.ink, fontWeight: t.weight.medium },
      Over: { color: t.error.ink, fontWeight: t.weight.medium },
    }),
  },
  { name: 'CoverLetterStyle' },
)

// ATTACHMENTS

export const AttachmentPart = slots(
  {
    attachments: L.in('layouts', Layout.stack({ gap: t.space.lg })),
    section: L.in('layouts', Layout.stack({ gap: t.space.xs })),
    sectionHeading: text(t.size.sm, t.text.subtle, { fontWeight: t.weight.medium }),
    // A file drop zone; `@foldkit/ui` marks it `data-drag-over` under a drag.
    dropZone: [
      U.textCenter,
      U.px('md'),
      U.py('lg'),
      U.rounded('lg'),
      U.pointer,
      {
        position: 'relative',
        display: 'block',
        border: `${t.border.thick} dashed ${t.outline.default}`,
      },
      Style.pseudo(':hover', {
        borderColor: t.accent.default,
        background: `color-mix(in oklch, ${t.accent.subtle} 50%, transparent)`,
      }),
      Style.pseudo('[data-drag-over]', {
        borderColor: t.accent.default,
        background: t.accent.subtle,
      }),
      // Upstream's Tailwind reads the `sr-only` class `@foldkit/ui` gives the file input.
      Style.nest('input[type="file"]', visuallyHidden),
    ],
    dropTitle: text(t.size.sm, t.text.subtle),
    dropHint: text(t.size.xs, t.text.muted, { marginBlockStart: t.space['2xs'] }),
    files: L.in('layouts', Layout.stack({ gap: t.space.xs })),
    file: card({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBlock: t.space.xs,
      paddingInline: t.space.sm,
    }),
    fileInfo: L.in('layouts', Layout.cluster({ gap: t.space.xs, align: 'center' })),
    fileIcon: U.text('lg'),
    fileText: { minWidth: '0' },
    fileName: text(t.size.sm, t.text.subtle),
    fileSize: text(t.size.xs, t.text.muted),
  },
  { name: 'AttachmentStyle' },
)

// REVIEW

export const ReviewPart = slots(
  {
    review: L.in('layouts', Layout.stack({ gap: t.space.md })),
    section: card({ padding: t.space.md }),
    sectionTitle: text(t.size.sm, t.text.overt, {
      marginBlockEnd: t.space.xs,
      fontWeight: t.weight.semibold,
    }),
    rows: Style.nest('& > * + *', {
      borderBlockStart: `${t.border.thin} solid ${t.surface.subtle}`,
    }),
    row: [U.flex, U.justify('between'), U.gap('md'), U.py('2xs')],
    rowLabel: text(t.size.sm, t.text.muted),
    rowValue: text(t.size.sm, t.text.overt, { overflowWrap: 'anywhere', textAlign: 'end' }),
    entries: L.in('layouts', Layout.stack({ gap: t.space.xs })),
    entry: U.py('2xs'),
    entryTitle: text(t.size.sm, t.text.overt, { fontWeight: t.weight.bold }),
    entryMeta: text(t.size.xs, t.text.muted),
    chips: L.in('layouts', Layout.cluster({ gap: '0.375rem' })),
    chip: text(t.size.xs, t.accent.ink, {
      paddingBlock: '0.125rem',
      paddingInline: '0.625rem',
      borderRadius: t.radius.full,
      background: t.accent.subtle,
      fontWeight: t.weight.medium,
    }),
    letter: text(t.size.sm, t.text.subtle, { whiteSpace: 'pre-wrap' }),
    // What was left out: no cover letter, no resume.
    missing: text(t.size.sm, t.text.muted, { fontStyle: 'italic' }),
    attachment: L.in('layouts', Layout.cluster({ gap: t.space.xs, align: 'center' })),
    attachmentIcon: Style.self({}),
    attachmentName: text(t.size.sm, t.text.subtle),
    submission: [
      L.in('layouts', Layout.stack({ gap: t.space.sm })),
      { paddingBlockStart: t.space.md },
    ],
    blockedNotice: text(t.size.sm, t.error.ink, { textAlign: 'center' }),
    // A step named in the notice, which takes the reader there.
    blockedNoticeStep: Style.slot({ capability: Capability.Interactive, events: [Event.Click] }, [
      text(t.size.sm, t.error.ink, {
        padding: '0',
        border: '0',
        background: 'transparent',
        textDecoration: 'underline',
        cursor: 'pointer',
      }),
    ]),
    success: card({
      marginBlockStart: t.space.md,
      padding: t.space.md,
      borderColor: t.success.outline,
      background: t.success.subtle,
      textAlign: 'center',
    }),
    successTitle: text(t.size.lg, t.success.ink, { fontWeight: t.weight.semibold }),
    successText: text(t.size.sm, t.success.ink, { marginBlockStart: t.space['2xs'] }),
    failure: card({
      padding: t.space.sm,
      borderColor: t.error.outline,
      background: t.error.subtle,
      fontSize: t.size.sm,
      color: t.error.ink,
    }),
  },
  { name: 'ReviewStyle' },
)

// PREVIEW

export const PreviewPart = slots(
  {
    preview: { fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", serif' },
    header: [
      U.textCenter,
      {
        marginBlockEnd: t.space.md,
        paddingBlockEnd: t.space.md,
        borderBlockEnd: `${t.border.thin} solid ${t.outline.subtle}`,
      },
    ],
    name: text(t.size.xl, t.text.overt, { fontFamily: 'inherit', fontWeight: t.weight.bold }),
    pronouns: text(t.size.xs, t.text.muted, { fontStyle: 'italic' }),
    contacts: text(t.size.xs, t.text.muted, {
      marginBlockStart: t.space['2xs'],
      overflowWrap: 'break-word',
    }),
    section: { marginBlockEnd: t.space.md },
    // The cover letter, the last section, with no space after it.
    lastSection: Style.self({}),
    sectionHeading: text(t.size.xs, t.text.muted, {
      marginBlockEnd: t.space.xs,
      paddingBlockEnd: t.space['2xs'],
      borderBlockEnd: `${t.border.thin} solid ${t.outline.subtle}`,
      fontFamily: 'inherit',
      fontWeight: t.weight.bold,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
    }),
    entry: { marginBlockEnd: t.space.sm },
    entryTitle: text(t.size.sm, t.text.overt, { display: 'block', fontWeight: t.weight.bold }),
    entryText: text(t.size.xs, t.text.subtle),
    entryMeta: text(t.size.xs, t.text.muted, { marginBlockStart: '0.125rem' }),
    entryDescription: text(t.size.xs, t.text.subtle, { marginBlockStart: t.space['2xs'] }),
    skillGroup: text(t.size.xs, t.text.subtle, { marginBlockEnd: t.space['2xs'] }),
    skillLevel: { color: t.text.overt },
    letter: text(t.size.xs, t.text.subtle, { whiteSpace: 'pre-wrap' }),
  },
  { name: 'PreviewStyle' },
)

// BUTTONS

const recipeButton = (
  name: string,
  selection: Parameters<typeof Recipes.Button>[0],
  button: StyleValue = Style.self({}),
) =>
  forSlots(ButtonSlots)(Recipes.Button.extend({ base: { button } })(selection), {
    name,
  })

/** Next, and submitting the application. */
export const PrimaryButtonStyle = recipeButton(
  'PrimaryButtonStyle',
  {},
  Style.self({ fontSize: t.size.sm }),
)

/** Previous: white, outlined in grey. */
export const SecondaryButtonStyle = recipeButton(
  'SecondaryButtonStyle',
  { tone: 'neutral', variant: 'outline' },
  Style.self({
    borderColor: t.outline.default,
    background: t.surface.base,
    fontSize: t.size.sm,
    color: t.text.subtle,
  }),
)

export const SubmitButtonStyle = recipeButton(
  'SubmitButtonStyle',
  {},
  Style.self({ width: '100%', fontSize: t.size.sm, fontWeight: t.weight.semibold }),
)

/** The button while the application is on its way: pale, and busy. */
export const SubmittingButtonStyle = recipeButton(
  'SubmittingButtonStyle',
  {},
  Style.self({
    width: '100%',
    opacity: '0.6',
    fontSize: t.size.sm,
    fontWeight: t.weight.semibold,
    cursor: 'wait',
  }),
)

/** "+ Add Position" and its kind: a dashed box the width of the step. */
export const AddEntryButtonStyle = forSlots(ButtonSlots)(
  {
    button: [
      U.text('sm'),
      U.font('medium'),
      U.color('text.muted'),
      U.pointer,
      {
        boxSizing: 'border-box',
        width: '100%',
        paddingBlock: t.space.sm,
        paddingInline: t.space.md,
        border: `${t.border.thick} dashed ${t.outline.default}`,
        borderRadius: t.radius.lg,
        background: 'transparent',
        font: 'inherit',
      },
      Style.pseudo(':hover', { borderColor: t.accent.default, color: t.accent.ink }),
      focusRing,
    ],
  },
  { name: 'AddEntryButtonStyle' },
)

/** "Remove": grey text that turns red. */
export const RemoveButtonStyle = forSlots(ButtonSlots)(
  {
    button: [
      U.text('sm'),
      U.color('text.muted'),
      U.pointer,
      {
        padding: '0',
        border: '0',
        background: 'transparent',
        font: 'inherit',
      },
      Style.pseudo(':hover', { color: t.error.ink }),
      focusRing,
    ],
  },
  { name: 'RemoveButtonStyle' },
)

/** The preview toggle: a floating pill, dark while the preview is open. */
export const PreviewToggleStyle = forSlots(ButtonSlots)(
  {
    button: [
      U.text('sm'),
      U.font('medium'),
      U.color('accent.on-fill'),
      U.pointer,
      {
        paddingBlock: t.space.xs,
        paddingInline: t.space.md,
        border: '0',
        borderRadius: t.radius.full,
        background: t.accent.default,
        font: 'inherit',
        boxShadow: floating,
      },
      Style.whenInput<boolean>(
        isPreviewVisible => isPreviewVisible,
        Style.self({ background: t.text.default, color: t.surface.base }),
      ),
      focusRing,
    ],
  },
  { name: 'PreviewToggleStyle' },
)
