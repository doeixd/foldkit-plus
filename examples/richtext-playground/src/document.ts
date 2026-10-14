/**
 * The document the playground opens with, and Reset returns to: one of everything the
 * vocabulary declares, and one discussion already under way, so each feature is there to try.
 */
import * as RichText from 'foldkit-richtext'

/** The phrase the opening discussion is anchored to. */
export const discussedPhrase = 'make something worth sharing'
export const firstThread = 'thread-1'

/** A landscape as an SVG `data:` URL, so the page loads no image from anywhere. */
const landscape = (): string => {
  const ridge = (color: string, points: string) =>
    `<polygon fill="${color}" points="0,360 ${points} 960,360"/>`
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 360">',
    '<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0" stop-color="#dedced"/><stop offset="1" stop-color="#fbdfcb"/>',
    '</linearGradient></defs>',
    '<rect width="960" height="360" fill="url(#sky)"/>',
    '<circle cx="720" cy="108" r="43" fill="#f5b482"/>',
    ridge('#b1b3cb', '0,236 185,120 365,235 560,170 750,235 960,155'),
    ridge('#717b9b', '0,302 230,213 465,296 755,235 960,285'),
    ridge('#465772', '0,339 280,293 530,320 775,275 960,330'),
    '</svg>',
  ].join('')
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

let next = 0
/** Identities for the seed, fresh on each call so a reset document shares none with the last. */
const fresh = () => `seed-${next++}`

type Mark = string | { readonly name: string; readonly props: Readonly<Record<string, string>> }
const run = (text: string, marks: ReadonlyArray<Mark> = []) => ({
  type: 'Text',
  id: fresh(),
  text,
  marks,
})
const paragraph = (...runs: ReadonlyArray<ReturnType<typeof run>>) => ({
  type: 'Paragraph',
  id: fresh(),
  children: runs,
})
const node = (kind: string, props: object, blocks: ReadonlyArray<unknown>) => ({
  type: 'Node',
  kind,
  id: fresh(),
  props,
  children: [],
  blocks,
})
const cell = (text: string) => node('TableCell', {}, [paragraph(run(text))])
const row = (cells: ReadonlyArray<string>, header = false) =>
  node('TableRow', header ? { header: true } : {}, cells.map(cell))
const task = (text: string, checked: boolean) =>
  node('TaskItem', { checked }, [paragraph(run(text))])

export const initialDocument = (): RichText.Document =>
  RichText.decodeDocument({
    version: 1,
    children: [
      { type: 'Heading', id: fresh(), level: 1, children: [run('A little room to think.')] },
      paragraph(
        run(
          'Good writing starts with a little room to think. Gather the ideas, move the pieces, and ',
        ),
        run(discussedPhrase, [{ name: 'Comment', props: { thread: firstThread } }]),
        run('.'),
      ),
      {
        type: 'Node',
        kind: 'Image',
        id: fresh(),
        props: {
          src: landscape(),
          alt: 'An illustrated sunrise above layered lavender and blue mountain ridges',
          caption: 'Morning light, somewhere between the mountains and the sea.',
          align: 'center',
        },
        children: [],
      },
      {
        type: 'Node',
        kind: 'Callout',
        id: fresh(),
        props: { icon: '✦' },
        children: [
          run(
            'Make yourself at home. Drag the handle beside any block. Select a few words to format them or start a conversation. Type ',
          ),
          run('/', ['Kbd']),
          run(' to add something new.'),
        ],
      },
      { type: 'Heading', id: fresh(), level: 2, children: [run('Shape the next good idea.')] },
      paragraph(
        run('This paragraph is yours to move. Try dragging it above the heading, or open its '),
        run('handle', ['Bold']),
        run(' to duplicate it. Some words deserve a '),
        run('highlight', ['Highlight']),
        run(', some an '),
        run('underline', ['Underline']),
        run(', and some a '),
        run('link', [{ name: 'Link', props: { href: 'https://foldkit-plus.pages.dev/richtext' } }]),
        run('.'),
      ),
      node('List', {}, [
        task('Find a good idea', true),
        task('Make room for the first draft', false),
      ]),
      node('Toggle', { open: false }, [
        paragraph(run('A little more detail')),
        paragraph(
          run(
            'Good tools leave space for the details. This is an editable disclosure block, with a title and content of its own.',
          ),
        ),
      ]),
      node('Quote', {}, [paragraph(run('The best starting point is something you can change.'))]),
      node('Table', {}, [
        row(['The piece', 'The possibility'], true),
        row(['A table', 'Give the details a little structure']),
        row(['A conversation', 'Bring another point of view']),
      ]),
      {
        type: 'Node',
        kind: 'CodeBlock',
        id: fresh(),
        props: { language: 'typescript' },
        children: [
          run(
            "const editor = editorAt('playground', {\n  rendering,\n  vocabulary,\n  inputRules: markdownInputRules,\n})",
          ),
        ],
      },
      paragraph(
        run('Keep the main idea easy to follow'),
        run('1', [{ name: 'FootnoteRef', props: { label: '1' } }]),
        run(', with the details a click away.'),
      ),
      node('FootnoteDefinition', { label: '1' }, [
        paragraph(
          run(
            'A footnote is a little room for context without interrupting the thought. Its arrow goes back to the reference.',
          ),
        ),
      ]),
      paragraph(run('Your next idea starts here.')),
    ],
  })
