/**
 * What the search shows, a pure function of the Model, as upstream's
 * `searchViewState.ts`, now over Remote's reads instead of a query cache:
 * nothing typed (`Idle`), a text that is no domain or reads that all failed
 * (`Failed`), nothing answered yet (`Loading`), or the prices answered so far
 * (`Ready`, with whether more are still being read or failed to be).
 */
import { Array, Option, Schema, String } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'
import { RemoteData } from 'foldkit-remote'
import { Projection } from 'foldkit-surface'
import { Domain, queryToMaybeDomainLabel } from '../shared/domain'
import { Quote } from '../shared/entity'
import { App, Data, type Model, answeredOf, readNames } from './app.js'

export const INVALID_LABEL =
  'Enter a domain name using letters, numbers, and hyphens (up to 63 characters).'
export const READ_FAILED = 'Could not load sample domains. Please try again.'

export const DomainRequest = defineTaggedUnion({
  Idle: {},
  Loading: {},
  Failed: { error: Schema.String },
})
export type DomainRequest = typeof DomainRequest.Type

export const SearchViewState = defineTaggedUnion({
  Idle: {},
  Loading: {},
  Ready: { domains: Schema.Array(Domain), domainRequest: DomainRequest },
  Failed: { error: Schema.String },
})
export type SearchViewState = typeof SearchViewState.Type

type Read = RemoteData<Domain>

const hasFailed = (data: Read): boolean =>
  RemoteData.match(data, {
    Initial: () => false,
    Loading: () => false,
    Ready: () => false,
    Refreshing: () => false,
    Failed: () => true,
    NotFound: () => false,
  })

const isInFlight = (data: Read): boolean =>
  RemoteData.match(data, {
    Initial: () => true,
    Loading: () => true,
    Ready: () => false,
    Refreshing: () => true,
    Failed: () => false,
    NotFound: () => false,
  })

const readOf =
  (model: Model) =>
  (name: string): Read =>
    Data.get(Quote, name).read(model)

const stateOf = (model: Model): SearchViewState => {
  if (String.isEmpty(model.query)) return SearchViewState.Idle()
  const label = queryToMaybeDomainLabel(model.query)
  if (Option.isNone(label)) return SearchViewState.Failed({ error: INVALID_LABEL })
  // The debounce has not settled the label typed: nothing of it is read yet.
  if (!Option.contains(model.settledLabel, label.value)) return SearchViewState.Loading()
  // Every name of the label read so far counts as checked, scrolled past or
  // not; whether more is coming is the reads the page makes now.
  const domains = answeredOf(model, label.value)
  const reading = Array.map(readNames(model), readOf(model))
  const loading = Array.some(reading, isInFlight)
  const failed = Array.some(reading, hasFailed)
  if (domains.length === 0)
    return failed && !loading
      ? SearchViewState.Failed({ error: READ_FAILED })
      : SearchViewState.Loading()
  return SearchViewState.Ready({ domains, domainRequest: requestOf(loading, failed) })
}

/**
 * What the search shows, worked out again only when a field it reads holds
 * something new: every render reads it, and most change none of them (a menu
 * opened, the cart).
 */
export const searchViewState = Projection.derive(
  [
    App.model.query,
    App.model.settledLabel,
    App.model.remote,
    App.model.resultsList,
    App.model.tldFilter,
    App.model.availabilityFilter,
    App.model.sortOrder,
  ],
  stateOf,
).read

/** A read still in flight says more is coming, even beside one that failed, as upstream's. */
const requestOf = (loading: boolean, failed: boolean): DomainRequest => {
  if (loading) return DomainRequest.Loading()
  if (failed) return DomainRequest.Failed({ error: READ_FAILED })
  return DomainRequest.Idle()
}
