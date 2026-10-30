import { Update } from 'foldkit'

import { makeFieldsStep } from '../definition'
import { AvailabilityFilter, SortOrder, TldFilter } from '../domain'
import { loadRequiredDomains } from './domainLoading'
import { informResultsList } from './resultsList'

export const updateTldFilter = (value: TldFilter) =>
  Update.combineSteps([
    makeFieldsStep(() => ({ tldFilter: () => value })),
    loadRequiredDomains,
    informResultsList,
  ])

export const updateAvailabilityFilter = (value: AvailabilityFilter) =>
  Update.combineSteps([
    makeFieldsStep(() => ({ availabilityFilter: () => value })),
    loadRequiredDomains,
    informResultsList,
  ])

export const updateSortOrder = (value: SortOrder) =>
  Update.combineSteps([
    makeFieldsStep(() => ({ sortOrder: () => value })),
    loadRequiredDomains,
    informResultsList,
  ])
