/**
 * Code coloured at build time with Shiki: each token carries a
 * `light-dark()` colour, so one rendering serves both schemes and the browser
 * loads no highlighter.
 */
import { createHighlighter, type BundledLanguage } from 'shiki'

export interface Token {
  readonly text: string
  /** A CSS colour, `light-dark(…, …)`, or empty for the block's own colour. */
  readonly color: string
}

export type Highlight = (
  code: string,
  lang: string | null | undefined,
) => ReadonlyArray<ReadonlyArray<Token>>

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
] as const satisfies ReadonlyArray<BundledLanguage>

/** What a fence may call a language, and the grammar it means. */
const aliases: Readonly<Record<string, (typeof languages)[number]>> = {
  ts: 'typescript',
  typescript: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  javascript: 'javascript',
  mjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  sh: 'bash',
  shell: 'bash',
  bash: 'bash',
  console: 'bash',
  html: 'html',
  css: 'css',
  sql: 'sql',
  yaml: 'yaml',
  yml: 'yaml',
  diff: 'diff',
  md: 'markdown',
  markdown: 'markdown',
}

const THEMES = { light: 'github-light', dark: 'github-dark' } as const

export const highlighter = async (): Promise<Highlight> => {
  const shiki = await createHighlighter({ themes: Object.values(THEMES), langs: [...languages] })
  return (code, lang) => {
    const grammar = lang === null || lang === undefined ? undefined : aliases[lang.toLowerCase()]
    if (grammar === undefined) return code.split('\n').map(line => [{ text: line, color: '' }])
    return shiki
      .codeToTokens(code, { lang: grammar, themes: THEMES, defaultColor: false })
      .tokens.map(line =>
        line.map(token => {
          const light = token.htmlStyle?.['--shiki-light']
          const dark = token.htmlStyle?.['--shiki-dark']
          return {
            text: token.content,
            color: light === undefined || dark === undefined ? '' : `light-dark(${light}, ${dark})`,
          }
        }),
      )
  }
}
