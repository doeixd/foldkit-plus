/**
 * The gallery as text: for each recipe, the key's stored form, the draft a
 * filled form shows, what it makes of a typed draft and of a refused one, and
 * how a list reads the value.
 */
import { Option } from 'effect'
import { gallery } from './gallery.js'
import { Outcome, read, type Reading } from './read.js'

const outcome = Outcome.match({
  Kept: ({ stored }) => `stores ${stored}`,
  Refused: ({ errors }) => `refused: ${errors.join('; ')}`,
})

const tried = (label: string, attempt: Option.Option<readonly [string, Outcome]>) =>
  Option.match(attempt, {
    onNone: () => [],
    onSome: ([text, result]) => [`  ${label} ${JSON.stringify(text)} ${outcome(result)}`],
  })

export const describe = (reading: Reading): ReadonlyArray<string> => [
  `${reading.entry.name}: ${reading.entry.call}`,
  `  stored ${reading.stored}`,
  ...Option.match(reading.draft, {
    onNone: () => ['  draft: the control’s own Model'],
    onSome: draft => [`  draft ${JSON.stringify(draft)}`],
  }),
  ...tried('typed', reading.typed),
  ...tried('typed', reading.refused),
  ...Option.match(reading.followed, {
    onNone: () => [],
    onSome: ({ key, text, draft }) => [
      `  follows ${key} ${JSON.stringify(text)} as ${JSON.stringify(draft)}`,
    ],
  }),
  `  in a list ${JSON.stringify(reading.display)}`,
]

export const runDemo = (): ReadonlyArray<string> => gallery.map(read).flatMap(describe)
