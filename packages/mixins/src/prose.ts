/**
 * `foldkit-mixins/prose`: the longform-content contract. One class carries
 * the rhythm between unlike elements (a heading and the paragraph after it,
 * a list and the paragraph before it); the measure and each rhythm step are
 * `--fk-prose-*` variables, so every prose container shares the class and
 * options only write variables. Belongs in the `components` layer.
 */
import { compose, inline, nest } from './styleValue.js'
import type { StyleValue } from './styleValue.js'

export interface ProseOptions {
  /** The line length, e.g. `'65ch'`. */
  readonly measure?: string
  /** The space before an element, by what it follows. */
  readonly rhythm?: Partial<{
    /** Between flowing blocks: paragraph after paragraph, list after paragraph. */
    readonly paragraph: string
    /** Before a heading; the content after a heading sits tight. */
    readonly heading: string
    /** Between list items and before a nested list. */
    readonly list: string
    /** Around figures, blockquotes, code blocks, tables, and rules. */
    readonly figure: string
  }>
}

const flow = 'var(--fk-prose-paragraph, var(--fk-space-md, 1em))'
const heading = 'var(--fk-prose-heading, var(--fk-space-xl, 1.8em))'
const list = 'var(--fk-prose-list, var(--fk-space-2xs, 0.35em))'
const figure = 'var(--fk-prose-figure, var(--fk-space-lg, 1.5em))'

const rules: StyleValue = compose(
  nest('> *', { marginBlock: '0' }),
  nest('> * + *', { marginBlockStart: flow }),
  nest('> :is(h2, h3, h4, h5, h6)', { marginBlockStart: heading }),
  nest('> :is(h1, h2, h3, h4, h5, h6) + *', { marginBlockStart: 'var(--fk-space-xs, 0.5em)' }),
  nest('> :is(figure, blockquote, pre, table, hr)', { marginBlock: figure }),
  nest(':is(ul, ol)', { paddingInlineStart: 'var(--fk-space-lg, 1.5em)' }),
  nest('li + li', { marginBlockStart: list }),
  nest(':is(li > ul, li > ol)', { marginBlockStart: list }),
  nest('blockquote', {
    paddingInlineStart: 'var(--fk-space-md, 1em)',
    borderInlineStart: 'var(--fk-border-heavy, 3px) solid var(--fk-outline-default, currentColor)',
    color: 'var(--fk-text-subtle, inherit)',
  }),
  nest('figcaption', {
    marginBlockStart: 'var(--fk-space-xs, 0.5em)',
    color: 'var(--fk-text-muted, inherit)',
    fontSize: 'var(--fk-size-sm, 0.875em)',
  }),
  nest('hr', {
    border: '0',
    borderBlockStart: 'var(--fk-border-thin, 1px) solid var(--fk-outline-subtle, currentColor)',
  }),
  nest('table', {
    inlineSize: '100%',
    borderCollapse: 'collapse',
    fontSize: 'var(--fk-size-sm, 0.875em)',
  }),
  nest(':is(th, td)', {
    padding: 'var(--fk-space-xs, 0.5em) var(--fk-space-sm, 0.75em)',
    borderBlockEnd: 'var(--fk-border-thin, 1px) solid var(--fk-outline-subtle, currentColor)',
    textAlign: 'start',
  }),
  nest('mark', {
    padding: '0 0.2em',
    background: 'var(--fk-accent-subtle, Mark)',
    color: 'var(--fk-accent-text, MarkText)',
  }),
  nest('abbr[title]', { textDecorationStyle: 'dotted', cursor: 'help' }),
  nest(':not(pre) > code', { overflowWrap: 'anywhere' }),
  nest('pre', { overflowX: 'auto' }),
  nest('a', { overflowWrap: 'anywhere' }),
)

const variables = (options: ProseOptions): Readonly<Record<string, string>> => ({
  ...(options.measure === undefined ? {} : { '--fk-prose-measure': options.measure }),
  ...(options.rhythm?.paragraph === undefined
    ? {}
    : { '--fk-prose-paragraph': options.rhythm.paragraph }),
  ...(options.rhythm?.heading === undefined
    ? {}
    : { '--fk-prose-heading': options.rhythm.heading }),
  ...(options.rhythm?.list === undefined ? {} : { '--fk-prose-list': options.rhythm.list }),
  ...(options.rhythm?.figure === undefined ? {} : { '--fk-prose-figure': options.rhythm.figure }),
})

/** The prose container: one class for every caller, options as variables on it. */
export const style = (options: ProseOptions = {}): StyleValue =>
  compose(
    inline({
      maxInlineSize: 'var(--fk-prose-measure, 65ch)',
      lineHeight: 'var(--fk-leading-relaxed, 1.6)',
      ...variables(options),
    }),
    rules,
  )

export const Prose = { style } as const
