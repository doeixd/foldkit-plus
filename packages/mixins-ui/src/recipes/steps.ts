/**
 * Steps: round numbered markers joined by a hairline. An upcoming marker is
 * outlined and muted, the current one tinted in the accent, a complete one
 * filled with a check drawn in CSS over its hidden number, and the line
 * after a complete step takes the accent. `orientation: 'horizontal'` lays
 * the steps in a row as wide as its container, the lines stretching between
 * them, and below 32rem only the current step's label shows, the lines
 * shortening for it and a word still too long cut with an ellipsis;
 * `orientation: 'vertical'` stacks them, each line running down from under
 * its marker beside the step's content, in the body's size under its
 * title. The states fade on the fast tier; nothing moves. A step's icon in
 * the marker is hidden under the check once the step is complete. The
 * horizontal row draws no step's `content`, having no room under each step
 * for it.
 *
 * `size` sets the marker on the Avatar's sizes, so an avatar or its
 * initials fit one: `xs` 1.25rem, `sm` 1.5rem, `md` 2.5rem, `lg` 3.5rem;
 * unset, it is 1.75rem. `marker: 'dot'` draws each marker as the Badge's
 * dot, no number, the current one ringed. `connector: 'progress'` draws the
 * connectors as the Progress bar's track, filled after a complete step and,
 * after the current one, by the view's `progress`; the fill grows on the
 * moderate tier, and only where motion travels.
 */
import { Style } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { StepsSlots } from '../steps.js'
import {
  component,
  cornerSides,
  focusRing,
  ref,
  transition,
  travelled,
  unfilledHover,
  variant,
} from './design.js'

const complete = '[data-state="complete"]'
const current = '[data-state="current"]'
const upcoming = '[data-state="upcoming"]'

const markerSize = 'var(--_fk-steps-marker)'
// The Progress bar's track.
const track = '0.5rem'
// The Badge's dot, a touch larger to stand as a marker.
const dot = '0.5rem'
const fill = 'var(--_fk-steps-fill, 0)'
const line = `var(--_fk-steps-line, ${ref.border.thick})`

const marker = (size: string, fontSize: string) => ({
  root: variant(Style.self({ '--_fk-steps-marker': size, '--_fk-steps-marker-text': fontSize })),
})

// From the top, so every title starts on its marker's line however long the
// text under it; centered, a step with a description stood its title higher.
const stepLayout = Style.self({
  display: 'flex',
  alignItems: 'start',
  gap: ref.space.xs,
  minInlineSize: '0',
})

// Below this width a row of steps has no room for every label: only the
// current step's shows, and the others stay for a screen reader.
const narrow = '@container (max-width: 32rem)'
// Below this one, beside four markers the current label would keep a letter
// or two: its words take a line of their own under the row instead.
const cramped = '@container (max-width: 17rem)'
const titleLine = role('body').lineHeight
const descriptionLine = role('caption').lineHeight

export const Steps = Style.recipeFor(StepsSlots)({
  base: {
    root: component(
      Style.self({
        display: 'flex',
        margin: '0',
        padding: '0',
        listStyle: 'none',
        '--_fk-steps-marker': '1.75rem',
      }),
    ),
    item: component(Style.self({ display: 'flex', minInlineSize: '0' })),
    step: component(stepLayout),
    trigger: component(
      stepLayout,
      Style.self({
        margin: `calc(-1 * ${ref.space['2xs']})`,
        padding: ref.space['2xs'],
        border: '0',
        borderRadius: ref.radius.md,
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        textAlign: 'start',
        cursor: 'pointer',
        ...transition('background-color'),
      }),
      Style.pseudo(':hover', { background: unfilledHover }),
      focusRing,
    ),
    marker: component(
      Style.self({
        position: 'relative',
        display: 'grid',
        placeItems: 'center',
        flexShrink: '0',
        inlineSize: markerSize,
        blockSize: markerSize,
        borderRadius: ref.radius.full,
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        ...role('caption'),
        fontSize: `var(--_fk-steps-marker-text, ${role('caption').fontSize})`,
        fontWeight: ref.weight.medium,
        fontVariantNumeric: 'tabular-nums',
        ...transition('background-color, border-color, color'),
      }),
      // An icon a step draws, sized to the marker's text as a glyph is.
      Style.nest('& > *', { inlineSize: '1.15em', blockSize: '1.15em' }),
      Style.nest(`&${complete} > *`, { visibility: 'hidden' }),
      Style.pseudo(upcoming, { color: ref.text.muted }),
      Style.pseudo(current, {
        borderColor: ref.accent.default,
        background: ref.accent.subtle,
        color: ref.accent.ink,
      }),
      // The number stays for the box's size; the check is drawn over it.
      Style.pseudo(complete, {
        borderColor: ref.accent.default,
        background: ref.accent.default,
        color: 'transparent',
      }),
      Style.nest(`&${complete}::after`, {
        content: '""',
        position: 'absolute',
        inlineSize: '0.3rem',
        blockSize: '0.6rem',
        ...cornerSides(ref.border.thick, ref.accent['on-fill']),
        rotate: '45deg',
        translate: '0 -10%',
      }),
    ),
    text: component(Style.self({ display: 'grid', minInlineSize: '0' })),
    title: component(
      Style.self({
        ...role('body'),
        // The first line centered on the marker beside it.
        marginBlockStart: `max(0px, (${markerSize} - 1lh) / 2)`,
        color: ref.text.default,
        ...transition('color'),
      }),
      Style.pseudo(upcoming, { color: ref.text.muted }),
      Style.pseudo(current, { color: ref.text.overt, fontWeight: ref.weight.medium }),
    ),
    description: component(Style.self({ ...role('caption'), color: ref.text.muted })),
    // Under the title and no larger: a body's size, muted, so the title leads.
    content: component(Style.self({ minInlineSize: '0', ...role('body'), color: ref.text.muted })),
    connector: component(
      Style.self({ background: ref.outline.subtle, ...transition('background-color') }),
      Style.pseudo(complete, { background: ref.accent.default }),
    ),
  },
  variants: {
    orientation: {
      horizontal: {
        // The row is the container its narrow layout asks about, so it takes
        // its container's width rather than its content's.
        root: variant(
          Style.self({
            alignItems: 'start',
            gap: ref.space.xs,
            inlineSize: '100%',
            containerType: 'inline-size',
            // What the current step's words are placed against when cramped.
            position: 'relative',
          }),
        ),
        // Every step but the last grows, so the lines share the free width.
        item: variant(
          Style.self({ flex: '1 1 0', minInlineSize: '0', alignItems: 'start', gap: ref.space.xs }),
          Style.pseudo(':last-child', { flex: '0 0 auto' }),
          // Narrow, the current step is at least as wide as its words, and the
          // others share the rest evenly, so the markers stay evenly spaced.
          Style.at(
            narrow,
            Style.nest(':where([aria-current="step"]:not(:last-child))&', {
              minInlineSize: 'max-content',
            }),
          ),
          // Room under the row for the words drawn there; with no words in
          // it, the steps share the row again, so the lines are even.
          Style.at(
            cramped,
            Style.compose(
              Style.nest(':where([data-state]:not(:last-child))&', { flex: '1 1 0' }),
              Style.nest(':where([aria-current="step"])&', {
                paddingBlockEnd: `calc(${ref.space.xs} + ${titleLine})`,
              }),
              Style.nest(':where([aria-current="step"][data-described])&', {
                paddingBlockEnd: `calc(${ref.space.xs} + ${titleLine} + ${descriptionLine})`,
              }),
            ),
          ),
        ),
        // A word wider than the room a step has is cut short, not drawn over
        // the next marker: in a phone's row four markers leave the current
        // title a few dozen pixels.
        text: variant(
          Style.nest('& > *', { overflow: 'hidden', textOverflow: 'ellipsis' }),
          Style.at(
            narrow,
            Style.nest(':where([data-state]:not([aria-current="step"])) > * > &', {
              position: 'absolute',
              width: '1px',
              height: '1px',
              margin: '-1px',
              overflow: 'hidden',
              clip: 'rect(0, 0, 0, 0)',
              whiteSpace: 'nowrap',
            }),
          ),
          Style.at(
            cramped,
            Style.compose(
              Style.nest(':where([aria-current="step"]) > * > &', {
                position: 'absolute',
                insetInline: '0',
                insetBlockStart: `calc(${markerSize} + ${ref.space.xs})`,
              }),
              Style.nest('& > *', { whiteSpace: 'nowrap' }),
            ),
          ),
        ),
        // Under the row, a title starts its line rather than centering on a marker.
        title: variant(Style.at(cramped, Style.pseudo(current, { marginBlockStart: '0' }))),
        content: variant(Style.self({ display: 'none' })),
        // On the markers' middle line, wherever the text below them ends; as
        // thick as the line, or as the Progress track.
        connector: variant(
          Style.self({
            flex: '1',
            minInlineSize: ref.space.md,
            blockSize: line,
            marginBlockStart: `calc((${markerSize} - ${line}) / 2)`,
          }),
          // Shorter where room is short, so the one title shown keeps its words.
          Style.at(narrow, Style.self({ minInlineSize: ref.space.xs })),
          Style.nest('&::before', {
            blockSize: '100%',
            inlineSize: `calc(${fill} * 100%)`,
            transitionProperty: 'inline-size',
            transitionDuration: travelled(ref.motion.moderate),
            transitionTimingFunction: ref.motion.settle,
          }),
        ),
      },
      vertical: {
        root: variant(Style.self({ flexDirection: 'column' })),
        // The marker's column, then the text's: the step spans both, and
        // under it the line keeps the marker's column beside the content.
        item: variant(
          Style.self({
            display: 'grid',
            gridTemplateColumns: `${markerSize} minmax(0, 1fr)`,
            columnGap: ref.space.xs,
          }),
        ),
        // The first row by name: the line spans it too, and would push it down.
        step: variant(Style.self({ gridColumn: '1 / -1', gridRow: '1' })),
        trigger: variant(Style.self({ gridColumn: '1 / -1', gridRow: '1' })),
        content: variant(
          Style.self({
            gridColumn: '2',
            gridRow: '2',
            paddingBlock: `${ref.space['2xs']} ${ref.space.sm}`,
          }),
        ),
        // Under the marker's center, from its foot to the next marker's top:
        // down both rows from the marker's height, so a title and description
        // taller than the marker leave no gap under it.
        connector: variant(
          Style.self({
            gridColumn: '1',
            gridRow: '1 / 3',
            justifySelf: 'center',
            inlineSize: line,
            minBlockSize: ref.space.lg,
            marginBlockStart: markerSize,
          }),
          Style.nest('&::before', {
            inlineSize: '100%',
            blockSize: `calc(${fill} * 100%)`,
            transitionProperty: 'block-size',
            transitionDuration: travelled(ref.motion.moderate),
            transitionTimingFunction: ref.motion.settle,
          }),
        ),
      },
    },
    // The Avatar's sizes and their text.
    size: {
      xs: marker('1.25rem', `calc(${ref.size.xs} * 0.75)`),
      sm: marker('1.5rem', ref.size.xs),
      md: marker('2.5rem', ref.size.sm),
      lg: marker('3.5rem', role('subtitle').fontSize),
    },
    marker: {
      number: {},
      // The Badge's dot, centred in a box of the marker's size, so titles and lines keep their places.
      dot: {
        marker: variant(
          Style.self({
            border: '0',
            background: 'transparent',
            color: 'transparent',
          }),
          // Out of the flow, so the hidden number takes no row of the grid
          // under it and the dot keeps the middle the connector runs along.
          Style.nest('&::before', {
            content: '""',
            position: 'absolute',
            inset: '0',
            margin: 'auto',
            inlineSize: dot,
            blockSize: dot,
            borderRadius: ref.radius.full,
            background: ref.outline.default,
            ...transition('background-color, box-shadow'),
          }),
          Style.nest('& > *', { display: 'none' }),
          Style.nest(`&:is(${complete}, ${current})::before`, { background: ref.accent.default }),
          Style.nest(`&${current}::before`, {
            boxShadow: `0 0 0 0.25rem ${ref.accent.subtle}`,
          }),
          Style.nest(`&${complete}::after`, { display: 'none' }),
          Style.pseudo(`:is(${complete}, ${current})`, {
            background: 'transparent',
            color: 'transparent',
          }),
        ),
      },
    },
    connector: {
      line: {},
      progress: {
        connector: variant(
          Style.self({
            position: 'relative',
            overflow: 'hidden',
            borderRadius: ref.radius.full,
            background: ref.outline.subtle,
            '--_fk-steps-line': track,
          }),
          Style.pseudo(complete, { background: ref.outline.subtle, '--_fk-steps-fill': '1' }),
          Style.pseudo(current, { '--_fk-steps-fill': 'var(--fk-steps-progress, 0)' }),
          Style.nest('&::before', {
            content: '""',
            position: 'absolute',
            insetInlineStart: '0',
            insetBlockStart: '0',
            borderRadius: ref.radius.full,
            background: ref.accent.default,
          }),
        ),
      },
    },
  },
  defaults: { orientation: 'horizontal' },
})
