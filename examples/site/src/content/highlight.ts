/**
 * Code tokenized at build time by `foldkit-richtext-code-shiki`: Shiki's
 * grammars read into the `syntax-*` kinds, which the theme colors, so the page
 * carries kinds and no colors and the browser loads no highlighter.
 */
import type { CodeBlock } from 'foldkit-mixins-ui'
import { shikiTokenizers } from 'foldkit-richtext-code-shiki'
import { createHighlighter } from 'shiki'

/** A language's tokens, or none for a language with no grammar here. */
export type Highlight = (
  code: string,
  lang: string | null | undefined,
) => ReadonlyArray<CodeBlock.CodeToken>

const languages = [
  'typescript',
  'tsx',
  'javascript',
  'json',
  'bash',
  'html',
  'css',
  'sql',
  'yaml',
  'diff',
  'markdown',
]

/** What a fence may call a language, and the grammar it means. */
const aliases: Readonly<Record<string, string>> = {
  ts: 'typescript',
  js: 'javascript',
  mjs: 'javascript',
  jsonc: 'json',
  sh: 'bash',
  shell: 'bash',
  console: 'bash',
  yml: 'yaml',
  md: 'markdown',
}

export const highlighter = async (): Promise<Highlight> => {
  // A theme is loaded only because tokenizing needs one; its colors are not used.
  const tokenizers = shikiTokenizers(
    await createHighlighter({ themes: ['github-light'], langs: languages }),
  )
  return (code, lang) => {
    if (lang === null || lang === undefined) return []
    const name = lang.toLowerCase()
    return tokenizers.get(Object.hasOwn(aliases, name) ? aliases[name]! : name)?.(code) ?? []
  }
}
