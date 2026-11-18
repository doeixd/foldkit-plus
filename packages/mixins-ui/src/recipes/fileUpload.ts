/**
 * A file upload. One markup, four `layout`s of its `picker` (the label of the
 * hidden file input): `button` is Button's outlined face, `zone` a dashed drop
 * area, `avatar` a disc over the view's `picture` and `cover` a wide frame
 * over it. The two with a picture show a veil over it while the pointer is
 * on it, while the input has keyboard focus, and always where nothing hovers.
 * A drag over the picker sets `data-dragging`; each layout writes its own
 * response beside the property it sets. `list` is the rows' look, `rows` or a
 * `grid` of cards, and `size` is Button's ladder step.
 *
 * The input is a transparent pixel rather than hidden, so it stays focusable
 * and the browser can still show a `required` message at it, and the picker
 * rings when it has keyboard focus.
 */
import { Style, type Declarations } from 'foldkit-mixins'
import { ladder, nested, nests } from 'foldkit-mixins/theme'
import { glyph } from '../icons.js'
import { FileUploadSlots } from '../fileUpload.js'
import { Avatar } from './avatar.js'
import { Button } from './button.js'
import { Input } from './field.js'
import {
  component,
  controlCorner,
  controlHeight,
  disabled,
  focusRing,
  ref,
  steps,
  variant,
} from './design.js'

const { button: face } = Button({ tone: 'neutral', variant: 'outline' })
const { button: icon } = Button({ tone: 'neutral', variant: 'icon' })
const { button: quiet } = Button({ tone: 'neutral', variant: 'ghost' })
const { description } = Input({ variant: null })
// The disc's shape comes from the Avatar, whose radius follows the knob.
const { root: disc } = Avatar({ shape: 'circle' })

/** Out of sight, still read: the live region speaks and shows nothing. */
const unseen: Declarations = {
  position: 'absolute',
  inlineSize: '1px',
  blockSize: '1px',
  margin: '-1px',
  padding: '0',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: '0',
}

/** The film over a picture while the picker is the target of a press, and under every pointer that cannot hover. */
const veil = [
  variant(
    Style.self({ '--_fk-upload-veil': '0' }),
    Style.pseudo(':hover', { '--_fk-upload-veil': '1' }),
    Style.nest('input:focus-visible + &', { '--_fk-upload-veil': '1' }),
    Style.media('(hover: none)', { '--_fk-upload-veil': '1' }),
    // Only over a picture: an empty frame under a film is a heavy grey slab, and has its own hover.
    Style.pseudo(':has(img)::after', {
      content: '""',
      position: 'absolute',
      inset: '0',
      borderRadius: 'inherit',
      background: `color-mix(in oklab, ${ref.text.default} 45%, transparent)`,
      opacity: 'var(--_fk-upload-veil)',
      pointerEvents: 'none',
      transitionProperty: 'opacity',
      transitionDuration: ref.motion.fast,
    }),
  ),
]

/** Behind a button that sits over a picture, so it reads on any image. */
const scrim = `color-mix(in oklab, ${ref.surface.base} 85%, transparent)`

/** The zone at rest: the page's own surface with a faint step, as the site's code panel is. */
const zoneGround = `color-mix(in oklab, ${ref.surface.subtle} 70%, ${ref.surface.base})`

/** A button's corner over a tile or a frame: concentric with the corner it sits in, never sharper than `sm`. */
const chipCorner = (inset: string) =>
  `max(${ref.radius.sm}, ${nested('var(--fk-outer-radius, 0px)', inset)})`

/** A thumbnail, or its stand-in: a non-image shows its extension. */
const thumb: Declarations = {
  flex: 'none',
  display: 'grid',
  placeItems: 'center',
  overflow: 'hidden',
  borderRadius: ref.radius.sm,
  objectFit: 'cover',
  backgroundColor: ref.surface.muted,
  color: ref.text.subtle,
  fontSize: `calc(${ref.size.xs} * 0.85)`,
  fontWeight: ref.weight.semibold,
  letterSpacing: '0.02em',
}

/** A button over a picture, smaller than a control so the picture stays the subject. */
const chipBox: Declarations = {
  inlineSize: '1.75rem',
  blockSize: '1.75rem',
  minInlineSize: '0',
  minBlockSize: '0',
}

const rowSelf: Declarations = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: ref.space.xs,
  paddingInline: ref.space.xs,
  paddingBlock: ref.space['2xs'],
  border: `${ref.border.thin} solid ${ref.outline.default}`,
  borderRadius: ref.radius.md,
  color: ref.text.default,
}

export const FileUpload = Style.recipeFor(FileUploadSlots)({
  base: {
    root: component(
      Style.self({
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'start',
        gap: ref.space.xs,
        color: ref.text.default,
      }),
    ),
    input: component(
      Style.self({
        position: 'absolute',
        insetBlockStart: '0',
        insetInlineStart: '0',
        inlineSize: '1px',
        blockSize: '1px',
        margin: '0',
        overflow: 'hidden',
        opacity: '0',
      }),
    ),
    picker: component(
      Style.self({ cursor: 'pointer', boxSizing: 'border-box' }),
      Style.pseudo('[data-disabled]', { cursor: 'not-allowed' }),
      Style.pseudo('[data-disabled]', {
        opacity: ref.knob['state-disabled'],
        pointerEvents: 'none',
      }),
      // The label is not focusable: its input, which comes first, is.
      Style.nest('input:focus-visible + &', {
        outline: `${ref.border.thick} solid ${ref.outline.focus}`,
        outlineOffset: '2px',
      }),
    ),
    prompt: component(Style.self({ color: ref.text.muted })),
    browse: component(Style.self({ minInlineSize: '0' })),
    picture: component(Style.self({ display: 'contents' })),
    description,
    constraints: [description, component(Style.self({ margin: '0' }))],
    status: component(Style.self(unseen)),
    errors: component(
      Style.self({
        display: 'grid',
        gap: ref.space['3xs'],
        margin: '0',
        padding: '0',
        listStyle: 'none',
        color: ref.error.ink,
        fontSize: ref.size.sm,
      }),
    ),
    summary: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: ref.space.xs,
        inlineSize: '100%',
        color: ref.text.muted,
        fontSize: ref.size.sm,
      }),
    ),
    clear: [quiet, component(focusRing, disabled)],
    list: component(
      Style.self({
        display: 'grid',
        gap: ref.space['2xs'],
        margin: '0',
        padding: '0',
        listStyle: 'none',
        inlineSize: '100%',
      }),
    ),
    name: component(
      Style.self({
        flex: '1 1 0',
        color: ref.text.default,
        minInlineSize: '0',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }),
    ),
    meta: component(
      Style.self({
        flex: 'none',
        minInlineSize: '4.5rem',
        textAlign: 'end',
        fontVariantNumeric: 'tabular-nums',
        color: ref.text.muted,
        fontSize: ref.size.sm,
      }),
    ),
    state: component(
      Style.self({ flex: 'none', color: ref.text.muted, fontSize: ref.size.sm }),
      Style.nest(':where([data-status="failed"]) > &', { color: ref.error.ink }),
      Style.nest(':where([data-status="done"]) > &', { color: ref.success.ink }),
    ),
    // After the row's buttons, on a line of its own.
    progress: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        flex: '1 0 100%',
        order: '1',
        minInlineSize: '0',
      }),
    ),
    actions: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        gap: ref.space['3xs'],
        marginInlineStart: 'auto',
      }),
    ),
    retry: [
      icon,
      component(
        glyph(ladder('icon')),
        Style.self({ '--icon': ref.icon['rotate-ccw'] }),
        focusRing,
        disabled,
      ),
    ],
    remove: [
      icon,
      component(
        glyph(ladder('icon')),
        Style.self({ '--icon': ref.icon.close }),
        focusRing,
        disabled,
      ),
    ],
    grip: [
      icon,
      component(
        Style.self({
          flex: 'none',
          cursor: 'grab',
          touchAction: 'none',
          backgroundImage: `radial-gradient(currentColor 1.5px, transparent 1.6px)`,
          backgroundSize: '6px 6px',
          backgroundClip: 'content-box',
          backgroundOrigin: 'content-box',
          paddingInline: ref.space.xs,
        }),
        focusRing,
      ),
    ],
  },
  variants: {
    layout: {
      button: {
        picker: [
          face,
          variant(
            Style.nest(':where([data-invalid]) > &', { borderColor: ref.error.outline }),
            Style.pseudo('[data-dragging]', { borderColor: ref.accent.default }),
          ),
        ],
      },
      zone: {
        root: variant(Style.self({ alignItems: 'stretch' })),
        picker: variant(
          Style.self({
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: ref.space['3xs'],
            minBlockSize: `calc(${controlHeight} * 2.5)`,
            padding: ref.space.lg,
            borderStyle: 'dashed',
            borderWidth: ref.border.thin,
            borderColor: ref.outline.default,
            borderRadius: controlCorner,
            backgroundColor: zoneGround,
            color: ref.text.default,
            textAlign: 'center',
          }),
          // A hover is a stronger outline; a drag or an error outranks it, so each is written
          // for the hovered picker too (longhands only, the states set what the base sets).
          Style.pseudo(':hover', { borderColor: ref.outline.overt }),
          Style.nest(':where([data-invalid]) > &', { borderColor: ref.error.outline }),
          Style.nest(':where([data-invalid]) > &:hover', { borderColor: ref.error.outline }),
          Style.pseudo('[data-dragging]', {
            borderColor: ref.accent.default,
            backgroundColor: ref.accent.subtle,
          }),
          Style.pseudo('[data-dragging]:hover', {
            borderColor: ref.accent.default,
            backgroundColor: ref.accent.subtle,
          }),
        ),
        // The invitation is muted until a drag is over the zone.
        prompt: variant(Style.nest(':where([data-dragging]) > &', { color: ref.accent.ink })),
        // The theme's link treatment, set on the words and not on a link element: medium,
        // underlined where the picker is hovered, focused by keyboard or dragged over.
        browse: variant(
          Style.self({
            color: ref.text.link,
            fontWeight: ref.weight.medium,
            textDecorationLine: 'none',
            textUnderlineOffset: '0.2em',
          }),
          Style.nest(':where(label:hover, input:focus-visible + label, [data-dragging]) > &', {
            textDecorationLine: 'underline',
          }),
          Style.nest(':where([data-dragging]) > &', { color: ref.accent.ink }),
        ),
      },
      avatar: {
        picker: [
          disc,
          variant(
            Style.self({
              position: 'relative',
              display: 'inline-flex',
              inlineSize: 'auto',
              blockSize: 'auto',
              overflow: 'hidden',
              fontSize: 'inherit',
              boxShadow: 'none',
            }),
            Style.pseudo('[data-dragging]', {
              boxShadow: `0 0 0 ${ref.border.thick} ${ref.accent.default}`,
            }),
            Style.nest(':where([data-invalid]) > &', {
              boxShadow: `0 0 0 ${ref.border.thick} ${ref.error.outline}`,
            }),
          ),
          ...veil,
        ],
        // The disc, the one file's buttons beside it, and each paragraph on a row of its own.
        root: variant(Style.self({ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' })),
        actions: variant(
          Style.nest(':where([data-picture]) > &', { marginInlineStart: ref.space['2xs'] }),
        ),
        description: variant(Style.self({ flexBasis: '100%' })),
        constraints: variant(Style.self({ flexBasis: '100%' })),
        errors: variant(Style.self({ flexBasis: '100%' })),
      },
      cover: {
        root: variant(
          Style.self({
            alignItems: 'stretch',
            // A cover is as wide as its place: in a parent that centres or
            // shrinks its children, the frame was the width of its words.
            inlineSize: '100%',
            ...nests(ref.radius.lg, ref.space.xs, ref.border.thin),
          }),
        ),
        // What stands in the frame before an image does is centred in it.
        picture: variant(
          Style.self({
            display: 'grid',
            placeItems: 'center',
            inlineSize: '100%',
            blockSize: '100%',
            color: ref.text.muted,
          }),
        ),
        picker: [
          variant(
            Style.self({
              position: 'relative',
              display: 'block',
              inlineSize: '100%',
              aspectRatio: '16 / 9',
              overflow: 'hidden',
              borderStyle: 'dashed',
              borderWidth: ref.border.thin,
              borderColor: ref.outline.default,
              borderRadius: ref.radius.lg,
              backgroundColor: zoneGround,
            }),
            Style.nest('& img', { inlineSize: '100%', blockSize: '100%', objectFit: 'cover' }),
            Style.pseudo(':hover', { borderColor: ref.outline.overt }),
            Style.pseudo('[data-dragging]', {
              borderColor: ref.accent.default,
              backgroundColor: ref.accent.subtle,
            }),
            Style.nest(':where([data-invalid]) > &', { borderColor: ref.error.outline }),
            Style.nest(':where([data-invalid]) > &:hover', { borderColor: ref.error.outline }),
          ),
          ...veil,
        ],
        actions: variant(
          Style.nest(':where([data-picture]) > &', {
            position: 'absolute',
            insetBlockStart: ref.space.xs,
            insetInlineEnd: ref.space.xs,
            borderRadius: chipCorner(ref.space.xs),
            backgroundColor: scrim,
          }),
        ),
        // `[type]` outranks the icon variant's own size, which sits in the same layer.
        retry: variant(
          Style.self({ borderRadius: chipCorner(ref.space.xs) }),
          Style.pseudo('[type="button"]', chipBox),
        ),
        remove: variant(
          Style.self({ borderRadius: chipCorner(ref.space.xs) }),
          Style.pseudo('[type="button"]', chipBox),
        ),
      },
    },
    list: {
      rows: {
        item: variant(
          Style.self({
            ...rowSelf,
            minBlockSize: controlHeight,
            ...nests(ref.radius.md, ref.space['2xs'], ref.border.thin),
          }),
        ),
        preview: variant(Style.self({ ...thumb, inlineSize: '2rem', blockSize: '2rem' })),
        retry: variant(Style.self({ borderRadius: chipCorner(ref.space['2xs']) })),
        remove: variant(Style.self({ borderRadius: chipCorner(ref.space['2xs']) })),
      },
      grid: {
        // Tiles need room: in a parent that centres or shrinks its children the frame was the
        // width of its words, and the grid one column of tiles as wide as the zone.
        root: variant(Style.self({ inlineSize: '100%', maxInlineSize: '32rem' })),
        list: variant(
          Style.self({
            gridTemplateColumns: 'repeat(auto-fill, minmax(8rem, 1fr))',
            gap: ref.space.xs,
          }),
        ),
        item: variant(
          Style.self({
            ...rowSelf,
            position: 'relative',
            flexDirection: 'column',
            alignItems: 'stretch',
            flexWrap: 'nowrap',
            gap: ref.space['3xs'],
            padding: ref.space['2xs'],
            overflow: 'hidden',
            ...nests(ref.radius.md, ref.space['2xs'], ref.border.thin),
            // The chip shows while the tile is the target, and always where nothing hovers.
            '--_fk-upload-chip': '0',
          }),
          Style.pseudo(':is(:hover, :focus-within)', { '--_fk-upload-chip': '1' }),
          Style.media('(hover: none)', { '--_fk-upload-chip': '1' }),
        ),
        preview: variant(
          Style.self({ ...thumb, inlineSize: '100%', aspectRatio: '1', fontSize: ref.size.md }),
        ),
        name: variant(Style.self({ flex: 'none', paddingInline: ref.space['3xs'] })),
        meta: variant(
          Style.self({ minInlineSize: '0', textAlign: 'start', paddingInline: ref.space['3xs'] }),
        ),
        // One inset from the tile's top and end edges, on a chip that reads over any image.
        actions: variant(
          Style.self({
            position: 'absolute',
            insetBlockStart: ref.space.xs,
            insetInlineEnd: ref.space.xs,
            marginInlineStart: '0',
            borderRadius: chipCorner(ref.space.xs),
            backgroundColor: scrim,
            opacity: 'var(--_fk-upload-chip)',
            transitionProperty: 'opacity',
            transitionDuration: ref.motion.fast,
          }),
        ),
        retry: variant(
          Style.self({ borderRadius: chipCorner(ref.space.xs) }),
          Style.pseudo('[type="button"]', chipBox),
        ),
        remove: variant(
          Style.self({ borderRadius: chipCorner(ref.space.xs) }),
          Style.pseudo('[type="button"]', chipBox),
        ),
      },
    },
    size: {
      sm: { root: steps.sm },
      md: { root: steps.md },
      lg: { root: steps.lg },
    },
  },
  defaults: { layout: 'button', list: 'rows' },
})
