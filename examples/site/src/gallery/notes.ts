/**
 * What a component page says of keyboard and assistive technology, and the
 * heading of `packages/mixins-ui/README.md` that explains the widget. Each line
 * is read off the widget's source: the element it draws, the attribute it
 * sets, the key it answers.
 */
export interface Notes {
  readonly heading: string
  readonly lines: ReadonlyArray<string>
}

const notes = new Map<string, Notes>([
  [
    'disclosure',
    {
      heading: 'Navigation and structure',
      lines: [
        'The button is a real button: Enter and Space toggle the panel, and Tab reaches it.',
        '`aria-expanded` on the button says whether the panel is open, and `aria-controls` names the panel while it is.',
        'Through `animatePanel` a shut panel is `inert` and `aria-hidden`, so its links are not tab stops while it is out of sight.',
      ],
    },
  ],
  [
    'aspect-ratio',
    {
      heading: 'Images, icons and codes',
      lines: [
        'A plain `div` that holds a ratio: it has no role and no name, so it adds nothing to what a screen reader announces.',
        'What it holds carries its own text alternative: an `Image` takes its `alt`, a figure its caption.',
      ],
    },
  ],
  [
    'code-block',
    {
      heading: 'Images, icons and codes',
      lines: [
        'The block is a `figure` holding a `pre` and its `code`; the text is the code exactly, so a screen reader reads what is copied.',
        'The copy button is a `button` of `type="button"`: Tab reaches it, Enter and Space press it. It is drawn only when `copy` is given.',
        'A copy is announced in a `role="status"` region beside the button, not by moving focus.',
      ],
    },
  ],
  [
    'fieldset',
    {
      heading: 'Text and number fields',
      lines: [
        'A `fieldset` with its `legend`: assistive technology reads the legend as the name of the group the fields are in.',
        'A disabled fieldset has its legend and description dimmed by the recipe.',
      ],
    },
  ],
  [
    'figure',
    {
      heading: 'Images, icons and codes',
      lines: [
        'A `figure` with a `figcaption`: the caption names the figure for assistive technology with no `aria-label` of its own.',
        'With no caption no `figcaption` is drawn, so the content must carry its own alternative text.',
      ],
    },
  ],
  [
    'icon',
    {
      heading: 'Images, icons and codes',
      lines: [
        'With a `label` the icon is `role="img"` named by it; without one it is `aria-hidden`, which is right beside words.',
        'An icon alone in a control needs the label on the control or on the icon: a glyph with neither says nothing.',
      ],
    },
  ],
  [
    'image',
    {
      heading: 'Image',
      lines: [
        '`alt` is required: either what the image shows in words, or `Image.decorative`, which draws `alt=""` and `role="presentation"`.',
        'A provider with no URL leaves an empty frame, `role="img"` and named by its alt text, so the page keeps its box and its meaning.',
      ],
    },
  ],
  [
    'label',
    {
      heading: 'Text and number fields',
      lines: [
        'A native `label` with `for` set to the control’s id: pressing the label focuses the control, and the control takes the label as its name.',
      ],
    },
  ],
  [
    'typography',
    {
      heading: 'Showing content',
      lines: [
        '`h1` to `h4` draw those elements, so the level picks the heading outline: choose it by the page’s structure, not by size.',
        '`quote` draws a `blockquote` and `code` a `code`; the interface roles (`display`, `title`, `caption` and the rest) are paragraphs and add no heading.',
      ],
    },
  ],
  [
    'drawer',
    {
      heading: 'Sheet and Drawer',
      lines: [
        'The handle is a real `button` of `type="button"`: Tab reaches it, and Enter and Space press it. `label` names it once, so the name does not change as the drawer opens.',
        '`aria-expanded` on the handle says whether the panel is open, and `aria-controls` names the body.',
        'Nothing is trapped, dimmed or locked: the page under the drawer stays live, and Tab goes on through it.',
        'A peeking drawer hides its body (`visibility: hidden`) once the slide ends, so its controls leave the tab order and the accessibility tree.',
        '`Drawer.keepFocus`, passed beside the style, moves focus to the handle when the drawer goes down with focus in its body.',
      ],
    },
  ],
  [
    'app-shell',
    {
      heading: 'Navigation and structure',
      lines: [
        'The skip link comes first and shows only while focused; it targets the main region by id, which takes focus by script so Tab goes on from there.',
        'One landmark of each kind: the header is the banner, `main` the main region and the footer the content info. The side column is a plain region, since a `Sidebar` inside it is the navigation.',
        'The brand mark is hidden from a screen reader (`aria-hidden`); the title names the application.',
      ],
    },
  ],
])

export const notesFor = (slug: string): Notes | undefined => notes.get(slug)

/** GitHub's anchor for a heading: lower case, words joined by hyphens. */
export const anchorOf = (heading: string): string =>
  heading
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replaceAll(' ', '-')
