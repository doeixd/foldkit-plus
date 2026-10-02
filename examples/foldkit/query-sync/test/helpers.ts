import { Option } from 'effect'
import { modifyFields } from 'foldkit/struct'
import { type Url, fromString } from 'foldkit/url'

import { type Model, initialModel } from '../src/main.js'

export const urlOrThrow = (raw: string): Url =>
  Option.getOrThrowWith(fromString(raw), () => new Error(`Failed to parse url: ${raw}`))

export const withSearch = (search: string): Model =>
  modifyFields(initialModel, { search: () => search })
