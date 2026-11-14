import { Laws, type WriteEntry } from 'foldkit-entity'
import * as Domain from './domain.js'

/** Every declared write the domain exports, whatever it is named, by name: a module namespace's order is the runtime's (Node sorts it, a bundler may not). */
const writes = Object.values(Domain)
  .filter(
    (value): value is WriteEntry & typeof value =>
      typeof value === 'object' && value !== null && 'write' in value && value.write !== undefined,
  )
  .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

/** What `npx foldkit-plus laws src/laws.ts#report` prints, and `test/laws.test.ts` keeps in LAWS.md. */
export const report = Laws.check({ writes })
