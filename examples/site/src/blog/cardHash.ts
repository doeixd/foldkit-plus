/**
 * What `public/blog/og/cards.json` keeps for a card: a hash of the title and
 * date it draws, so a test can say a card is out of date. `scripts/social.mjs`
 * (Node strips the types) and `test/blog.test.ts` both read it from here.
 */
import { createHash } from 'node:crypto'

/** Bump it when the template changes: every card is then out of date. */
export const TEMPLATE = 1

export const hashOf = (title: string, date: string): string =>
  createHash('sha256').update(`${TEMPLATE}\n${title}\n${date}`).digest('hex').slice(0, 16)
