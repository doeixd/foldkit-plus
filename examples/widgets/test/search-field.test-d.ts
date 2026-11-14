import { Behavior, SlotView } from 'foldkit-mixins'
import { defineMessageUnion } from 'foldkit/message'
import { SearchSlots, SearchView } from '../src/search-field/view.js'
import type { SearchMessage, SearchModel } from '../src/search-field/child.js'

const Foreign = defineMessageUnion({ SentElsewhere: {} })

Behavior.forSlots(SearchSlots)<SearchModel, SearchMessage>({
  // @ts-expect-error the search view does not publish a clear slot: the field draws its own
  clear: Behavior.slot({}),
})

const TooWide = Behavior.forSlots(SearchSlots)<
  SearchModel & { readonly pending: boolean },
  SearchMessage
>({
  root: Behavior.slot({ attributes: ({ input, h }) => [h.AriaBusy(input.pending)] }),
})
const NeedsPending = SearchView.pipe(Behavior.attach(TooWide))
const withoutPending = { id: 'search', value: '', resultsOpen: false }
// @ts-expect-error attaching the Behavior widens what callers must provide
NeedsPending(withoutPending, SlotView.inertBuilder<SearchMessage>())

const Elsewhere = Behavior.forSlots(SearchSlots)<SearchModel, typeof Foreign.Type>({
  results: Behavior.slot({ attributes: ({ h }) => [h.OnClick(Foreign.SentElsewhere())] }),
})
// @ts-expect-error the search view cannot send a foreign Message
SearchView.pipe(Behavior.attach(Elsewhere))
