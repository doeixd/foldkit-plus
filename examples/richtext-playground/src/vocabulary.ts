/**
 * What the playground's documents may hold and how they draw: the standard vocabulary, plus the
 * kinds and marks this application declares for itself. Nothing here is a view; it is the Kit,
 * the rendering registry, the slash catalogue, and the code highlighting, all data or pure reads.
 */
import { Schema } from 'effect'
import * as RichText from 'foldkit-richtext'
import { shikiTokenizers } from 'foldkit-richtext-code-shiki'
import {
  Message as EditorMessage,
  slashEntries,
  type EditorEvent,
} from 'foldkit-richtext-dom/editor'
import type { SlashEntry } from 'foldkit-richtext-dom/editor'
import type { CodeLanguage } from 'foldkit-mixins-richtext'
import { createHighlighterCoreSync } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import css from 'shiki/langs/css.mjs'
import json from 'shiki/langs/json.mjs'
import typescript from 'shiki/langs/typescript.mjs'
import githubLight from 'shiki/themes/github-light.mjs'

// --- marks ---------------------------------------------------------------------------------

export const Underline = RichText.mark('Underline', { expand: 'after' })
export const Highlight = RichText.mark('Highlight', { expand: 'after' })
export const Kbd = RichText.mark('Kbd', { expand: 'none' })

/**
 * The text a discussion is about. The thread itself (who said what) is the application's
 * Model; the document holds only which text it is anchored to, so the anchor moves with the
 * text through every edit, split and undo, as any mark does.
 */
export const Comment = RichText.mark('Comment', {
  Props: Schema.Struct({ thread: Schema.String }),
  expand: 'none',
})

// --- node kinds ----------------------------------------------------------------------------

/**
 * A highlighted note with an icon, holding text directly. Enter breaks its line, and Enter on
 * an empty last line leaves it, so a note can run to several lines.
 */
export const Callout = RichText.node('Callout', {
  Props: Schema.Struct({ icon: Schema.String }),
  children: RichText.textContent,
  lineBreaks: true,
})

/**
 * A disclosure: its first block is the title, the rest show only while `open`. The open state
 * is a prop, so it is saved, undone and shared like the text.
 */
export const Toggle = RichText.node('Toggle', {
  Props: Schema.Struct({ open: Schema.Boolean }),
  children: RichText.blockContent,
})

/** The action of a note's ↩, which takes the caret back to the reference. */
export const RETURN_TO_REFERENCE = 'return-to-reference'

export const marks: ReadonlyArray<RichText.MarkDef> = [
  ...RichText.standardMarks,
  Underline,
  Highlight,
  Kbd,
  Comment,
  RichText.FootnoteRef,
]
export const nodes: ReadonlyArray<RichText.NodeDefinition> = [
  ...RichText.standardNodes,
  Callout,
  Toggle,
  RichText.FootnoteDefinition,
  ...RichText.mediaNodes,
]

export const vocabulary = {
  marks: RichText.markRegistry(marks),
  nodes: RichText.nodeRegistry(nodes),
}

// --- rendering -----------------------------------------------------------------------------

/** Image types a file may be, read into a `data:` URL here rather than fetched from anywhere. */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']

const DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml);base64,[A-Za-z0-9+/=]+$/

/**
 * An image source this page will draw: what the standard URL policy accepts, or an image read
 * from a file as a `data:` URL, which the policy refuses for links but which an `img` cannot
 * run. Anything else draws no picture.
 */
export const imageSource = (value: unknown): string | undefined =>
  typeof value !== 'string' ? undefined : DATA_IMAGE.test(value) ? value : RichText.safeUrl(value)

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/** The languages a code block may name, as its toolbar offers them and its label shows them. */
export const LANGUAGES: ReadonlyArray<CodeLanguage> = [
  { id: 'typescript', label: 'TypeScript' },
  { id: 'json', label: 'JSON' },
  { id: 'css', label: 'CSS' },
  { id: '', label: 'Plain text' },
]

export const rendering = RichText.renderingOver(
  RichText.renderingOver(RichText.standardRendering, RichText.mediaRendering),
  {
    marks: {
      Underline: { tag: 'u', attributes: {} },
      Highlight: { tag: 'mark', attributes: {} },
      Kbd: { tag: 'kbd', attributes: {} },
      Comment: mark => ({
        tag: 'span',
        attributes: { 'data-comment': text(RichText.markProps(mark)?.thread) },
      }),
      FootnoteRef: mark => {
        const label = text(RichText.markProps(mark)?.label)
        return { tag: 'sup', attributes: { 'data-footnote-ref': label, id: `fnref-${label}` } }
      },
    },
    nodes: {
      TaskItem: block => ({
        tag: 'li',
        attributes: { 'data-task': block.props.checked === true ? 'checked' : 'unchecked' },
        adornments: [
          {
            tag: 'input',
            attributes: {
              type: 'checkbox',
              'aria-label': 'Done',
              ...(block.props.checked === true ? { checked: '' } : {}),
            },
            toggles: 'checked',
          },
        ],
      }),
      CodeBlock: block => {
        const language = text(block.props.language)
        return {
          tag: 'pre',
          attributes: { 'data-language': language },
          adornments: [
            {
              tag: 'span',
              attributes: { 'data-code-label': '' },
              text: LANGUAGES.find(each => each.id === language)?.label ?? language,
            },
          ],
        }
      },
      Image: block => {
        const src = imageSource(block.props.src)
        const caption = text(block.props.caption)
        const width = block.props.width
        return {
          tag: 'figure',
          attributes: {
            'data-image': '',
            'data-align': text(block.props.align) || 'center',
            ...(typeof width === 'number' ? { style: `--image-width: ${width}px` } : {}),
          },
          adornments: [
            ...(src === undefined
              ? []
              : [{ tag: 'img', attributes: { src, alt: text(block.props.alt) } }]),
            ...(caption === '' ? [] : [{ tag: 'figcaption', attributes: {}, text: caption }]),
          ],
        }
      },
      Callout: block => ({
        tag: 'aside',
        attributes: { 'data-callout': '' },
        adornments: [
          { tag: 'span', attributes: { 'data-callout-icon': '' }, text: text(block.props.icon) },
        ],
      }),
      Toggle: block => ({
        tag: 'div',
        attributes: { 'data-toggle': block.props.open === true ? 'open' : 'closed' },
        adornments: [
          {
            tag: 'button',
            attributes: {
              type: 'button',
              'data-toggle-arrow': '',
              'aria-label': block.props.open === true ? 'Collapse' : 'Expand',
              'aria-expanded': block.props.open === true ? 'true' : 'false',
            },
            text: '▸',
            toggles: 'open',
          },
        ],
      }),
      FootnoteDefinition: block => {
        const label = text(block.props.label)
        return {
          tag: 'div',
          attributes: { 'data-footnote': label, id: `fn-${label}` },
          adornments: [
            { tag: 'span', attributes: { 'data-footnote-label': '' }, text: `${label}.` },
            {
              tag: 'button',
              attributes: { type: 'button', 'aria-label': 'Back to the reference' },
              text: '↩',
              action: RETURN_TO_REFERENCE,
            },
          ],
        }
      },
    },
  },
)

// --- blocks the menus insert ---------------------------------------------------------------

/**
 * Blocks to insert, with placeholder identities: `InsertBlock` mints fresh ones, so the same
 * value inserts any number of times.
 */
const id = RichText.NodeId.make
const run = (value = ''): RichText.Text => ({ type: 'Text', id: id('r'), text: value, marks: [] })
const paragraph = (value = ''): RichText.Block => ({
  type: 'Paragraph',
  id: id('p'),
  children: [run(value)],
})
const cell = (value = ''): RichText.Block => ({
  type: 'Node',
  kind: 'TableCell',
  id: id('c'),
  props: {},
  children: [],
  blocks: [paragraph(value)],
})
const row = (cells: ReadonlyArray<string>, header = false): RichText.Block => ({
  type: 'Node',
  kind: 'TableRow',
  id: id('row'),
  props: header ? { header: true } : {},
  children: [],
  blocks: cells.map(cell),
})

export const Blocks = {
  paragraph: () => paragraph(),
  divider: (): RichText.Block => ({
    type: 'Node',
    kind: 'ThematicBreak',
    id: id('hr'),
    props: {},
    children: [],
  }),
  table: (): RichText.Block => ({
    type: 'Node',
    kind: 'Table',
    id: id('table'),
    props: {},
    children: [],
    blocks: [row(['', '', ''], true), row(['', '', '']), row(['', '', ''])],
  }),
  callout: (): RichText.Block => ({
    type: 'Node',
    kind: 'Callout',
    id: id('callout'),
    props: { icon: '💡' },
    children: [run()],
  }),
  toggle: (): RichText.Block => ({
    type: 'Node',
    kind: 'Toggle',
    id: id('toggle'),
    props: { open: true },
    children: [],
    blocks: [paragraph(), paragraph()],
  }),
  image: (src: string, alt: string, width: number): RichText.Block => ({
    type: 'Node',
    kind: 'Image',
    id: id('image'),
    props: { src, alt, width, align: 'center' },
    children: [],
  }),
}

/** The playground's slash catalogue: the editor's own, then the blocks it declares. */
export const playgroundSlashEntries: ReadonlyArray<SlashEntry<EditorEvent>> = [
  ...slashEntries,
  {
    id: 'checklist',
    label: 'Checklist',
    keywords: ['todo', 'task', 'checkbox'],
    message: EditorMessage.WrappedBlock({
      containers: [{ kind: 'List' }, { kind: 'TaskItem', props: { checked: false } }],
    }),
    description: 'Things to tick off',
    group: 'Lists',
    icon: 'checklist',
  },
  {
    id: 'callout',
    label: 'Callout',
    keywords: ['note', 'aside', 'tip'],
    message: EditorMessage.InsertedBlock({ block: Blocks.callout() }),
    description: 'A note that stands out',
    group: 'Blocks',
    icon: 'callout',
  },
  {
    id: 'toggle',
    label: 'Toggle',
    keywords: ['disclosure', 'details', 'collapse'],
    message: EditorMessage.InsertedBlock({ block: Blocks.toggle() }),
    description: 'Detail that opens on a click',
    group: 'Blocks',
    icon: 'toggle',
  },
  {
    id: 'table',
    label: 'Table',
    keywords: ['grid', 'rows'],
    message: EditorMessage.InsertedBlock({ block: Blocks.table() }),
    description: 'Rows and columns',
    group: 'Blocks',
    icon: 'table',
  },
  {
    id: 'footnote',
    label: 'Footnote',
    keywords: ['note', 'reference', 'citation'],
    message: EditorMessage.InsertedFootnote({}),
    description: 'A numbered note at the end',
    group: 'Blocks',
    icon: 'footnote',
  },
  {
    id: 'divider',
    label: 'Divider',
    keywords: ['hr', 'rule', 'separator'],
    message: EditorMessage.InsertedBlock({ block: Blocks.divider() }),
    description: 'A line between parts',
    group: 'Blocks',
    icon: 'divider',
  },
]

// --- code highlighting ---------------------------------------------------------------------

/**
 * Tokenizers for the languages a code block may name. The highlighter is synchronous, because
 * decorating is a pure call made on every patch, so its grammars load with the page.
 */
const tokenizers = shikiTokenizers(
  createHighlighterCoreSync({
    themes: [githubLight],
    langs: [typescript, json, css],
    engine: createJavaScriptRegexEngine(),
  }),
)

export const decorate = (document: RichText.Document): RichText.DecorationSet =>
  RichText.codeDecorations(document, tokenizers)
