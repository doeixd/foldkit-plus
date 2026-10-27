/**
 * What a page may hold and how it draws: the standard vocabulary, two marks and a callout of
 * this application's own, and the slash catalogue that offers them. All data; the replicated
 * state carries any of it, since `Replicated.translate` restates every edit the editor makes.
 */
import { Schema } from 'effect'
import * as RichText from 'foldkit-richtext'
import {
  Message as EditorMessage,
  slashEntries,
  type EditorEvent,
  type SlashEntry,
} from 'foldkit-richtext-dom/editor'

export const Underline = RichText.mark('Underline', { expand: 'after' })
export const Highlight = RichText.mark('Highlight', { expand: 'after' })

/** A note set apart, with an icon. Enter breaks its line; Enter on an empty last line leaves it. */
export const Callout = RichText.node('Callout', {
  Props: Schema.Struct({ icon: Schema.String }),
  children: RichText.textContent,
  lineBreaks: true,
})

export const vocabulary = {
  marks: RichText.markRegistry([...RichText.standardMarks, Underline, Highlight]),
  nodes: RichText.nodeRegistry([...RichText.standardNodes, Callout]),
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

export const rendering = RichText.renderingOver(RichText.standardRendering, {
  marks: {
    Underline: { tag: 'u', attributes: {} },
    Highlight: { tag: 'mark', attributes: {} },
  },
  nodes: {
    // A box to tick: a click on it is the editor's own edit of `checked`, shared like typing.
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
    Callout: block => ({
      tag: 'aside',
      attributes: { 'data-callout': '' },
      adornments: [
        { tag: 'span', attributes: { 'data-callout-icon': '' }, text: text(block.props.icon) },
      ],
    }),
  },
})

/** The icons a callout's menu offers. */
export const CALLOUT_ICONS = ['💡', '📌', '⚠️', '✅', '✦']

/**
 * Blocks the menus insert, with placeholder identities: the editor mints fresh ones and
 * `translate` names them, so one value inserts any number of times.
 */
const id = RichText.NodeId.make
const run = (value = ''): RichText.Text => ({ type: 'Text', id: id('r'), text: value, marks: [] })
const cell = (): RichText.Block => ({
  type: 'Node',
  kind: 'TableCell',
  id: id('c'),
  props: {},
  children: [],
  blocks: [{ type: 'Paragraph', id: id('p'), children: [run()] }],
})
const row = (header: boolean): RichText.Block => ({
  type: 'Node',
  kind: 'TableRow',
  id: id('row'),
  props: header ? { header: true } : {},
  children: [],
  blocks: [cell(), cell(), cell()],
})

export const Blocks = {
  callout: (): RichText.Block => ({
    type: 'Node',
    kind: 'Callout',
    id: id('callout'),
    props: { icon: CALLOUT_ICONS[0]! },
    children: [run()],
  }),
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
    blocks: [row(true), row(false), row(false)],
  }),
}

/** The slash catalogue: the editor's own entries, then the blocks this vocabulary adds. */
export const pageSlashEntries: ReadonlyArray<SlashEntry<EditorEvent>> = [
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
    id: 'table',
    label: 'Table',
    keywords: ['grid', 'rows'],
    message: EditorMessage.InsertedBlock({ block: Blocks.table() }),
    description: 'Rows and columns',
    group: 'Blocks',
    icon: 'table',
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
