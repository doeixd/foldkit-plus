/**
 * The root README's list of demos, from `demos.ts`: one line each, between
 * `<!-- demos -->` and `<!-- /demos -->`.
 */
import { demos } from './demos.js'

const START = '<!-- demos -->'
const END = '<!-- /demos -->'

/** The list as the README carries it. */
export const demoList = (): string =>
  demos
    .map(
      demo =>
        `- [${demo.title}](${demo.url}) ([\`${demo.example}\`](./${demo.example})): ${demo.proves}`,
    )
    .join('\n')

/** The README's region between the markers; it fails when either is missing. */
export const listIn = (readme: string): string => {
  const start = readme.indexOf(START)
  const end = readme.indexOf(END)
  if (start === -1 || end < start) throw new Error(`the README has no ${START} … ${END} region`)
  return readme.slice(start + START.length, end).trim()
}

/** `readme` with the list written between its markers. */
export const withDemos = (readme: string): string => {
  listIn(readme)
  const start = readme.indexOf(START) + START.length
  return `${readme.slice(0, start)}\n${demoList()}\n${readme.slice(readme.indexOf(END))}`
}
