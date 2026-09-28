import { Array, Option } from 'effect'
import { describe, expect, test } from 'vitest'

import { type Model, Message, init, update } from '../src/main.js'
import { urlOrThrow } from './helpers.js'

const visit = (model: Model, path: string): Model =>
  update(model, Message.ChangedUrl({ url: urlOrThrow(`http://localhost${path}`) })).model

const walk = (start: string, paths: ReadonlyArray<string>): Model =>
  Array.reduce(paths, init(urlOrThrow(`http://localhost${start}`)).model, visit)

/** Each entry as `#n previous tag -> next tag`, the cold load's previous as `none`. */
const summaries = (model: Model): ReadonlyArray<string> =>
  Array.map(
    model.transitionLog,
    entry =>
      `#${entry.sequenceNumber} ${Option.match(entry.maybePreviousRoute, {
        onNone: () => 'none',
        onSome: route => route._tag,
      })} -> ${entry.nextRoute._tag}`,
  )

describe('the transition log', () => {
  test('holds every navigation, newest first, numbered from the cold load', () => {
    const model = walk('/', ['/gallery', '/gallery/1', '/gallery/2', '/studio', '/', '/'])

    expect(summaries(model)).toEqual([
      '#7 Home -> Home',
      '#6 Studio -> Home',
      '#5 Painting -> Studio',
      '#4 Painting -> Painting',
      '#3 Gallery -> Painting',
      '#2 Home -> Gallery',
      '#1 none -> Home',
    ])
  })

  test('keeps the twenty newest entries and keeps numbering past them', () => {
    const paths = Array.makeBy(25, index => (index % 2 === 0 ? '/gallery' : '/studio'))
    const numbers = Array.map(walk('/', paths).transitionLog, entry => entry.sequenceNumber)

    expect(numbers).toEqual(Array.makeBy(20, index => 26 - index))
  })
})
