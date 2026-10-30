/**
 * Upstream's `e2e/api.ts`, ported to the port's wire: the page reads names
 * by id from `POST /remote` (`{ operation: 'read', payload: { requests } }`),
 * so the mock groups the names a read asks for by label, asks `search` for
 * the range of the label's candidates that covers them, as upstream's mock
 * was asked for a range, and answers each name with its row, or with
 * nothing when `search` gave none. A failed `search` fails the read. The
 * signature is upstream's, so its specs call it unchanged.
 */
import type { Page } from '@playwright/test'
import { Effect, Exit } from 'effect'
import { type Domain, type DomainCandidateRange, domainCandidates } from '../src/shared/domain'
import { makeDomainFixtures } from '../src/shared/domain.fixture'
import type { SearchError } from '../src/shared/domainsRpc'

interface ReadRequest {
  readonly entity: string
  readonly id: string
}

/** A sample result as the port's server stores it: every case's fields, null where its case has none. */
const valuesOf = (domain: Domain) =>
  domain._tag === 'Available'
    ? { ...domain, id: domain.name }
    : {
        _tag: 'Unconfirmed',
        id: domain.name,
        name: domain.name,
        tld: domain.tld,
        price: null,
        renewalPrice: null,
        years: null,
        isPremium: null,
      }

export const mockDomainSearch = async (
  page: Page,
  search: (
    label: string,
    range: DomainCandidateRange,
  ) => Effect.Effect<ReadonlyArray<Domain>, SearchError> = label =>
    Effect.succeed(makeDomainFixtures(label)),
): Promise<void> => {
  await page.route('**/remote', async route => {
    const body: { readonly payload?: { readonly requests?: ReadonlyArray<ReadRequest> } } =
      JSON.parse(route.request().postData() ?? '{}')
    const requests = body.payload?.requests ?? []
    const byLabel = new Map<string, Array<string>>()
    for (const { id } of requests) {
      const label = id.slice(0, id.indexOf('.'))
      byLabel.set(label, [...(byLabel.get(label) ?? []), id])
    }
    const entities: Array<unknown> = []
    for (const [label, ids] of byLabel) {
      const names = domainCandidates(label).map(({ name }) => name)
      const indexes = ids.map(id => names.indexOf(id)).filter(index => index >= 0)
      if (indexes.length === 0) continue
      const offset = Math.min(...indexes)
      const limit = Math.max(...indexes) - offset + 1
      const exit = await Effect.runPromiseExit(search(label, { offset, limit }))
      if (Exit.isFailure(exit)) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { _tag: 'RemoteReadError', message: 'Unavailable' } }),
        })
        return
      }
      for (const domain of exit.value)
        if (ids.includes(domain.name))
          entities.push({ entity: 'Domain', id: domain.name, values: valuesOf(domain) })
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ result: { entities, settled: [] } }),
    })
  })
}
