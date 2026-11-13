import { Behavior, SlotView } from 'foldkit-mixins'
import {
  SearchSlots,
  SearchView,
  type SearchModel,
  type SearchMessage,
} from '../src/ui-sdk-search-field.js'
import { defineMessageUnion } from 'foldkit/message'

const Foreign = defineMessageUnion({ SentElsewhere: {} })

Behavior.forSlots(SearchSlots)<SearchModel, SearchMessage>({
  // @ts-expect-error the search view does not publish a results slot
  results: Behavior.slot({}),
})

const TooWide = Behavior.forSlots(SearchSlots)<
  SearchModel & { readonly pending: boolean },
  SearchMessage
>({
  root: Behavior.slot({ attributes: ({ input, h }) => [h.AriaBusy(input.pending)] }),
})
const NeedsPending = SearchView.pipe(Behavior.attach(TooWide))
// @ts-expect-error attaching the Behavior widens what callers must provide
NeedsPending({ id: 'search', value: '' }, SlotView.inertBuilder<SearchMessage>())

const Elsewhere = Behavior.forSlots(SearchSlots)<SearchModel, typeof Foreign.Type>({
  clear: Behavior.slot({ attributes: ({ h }) => [h.OnClick(Foreign.SentElsewhere())] }),
})
// @ts-expect-error the search view cannot send a foreign Message
SearchView.pipe(Behavior.attach(Elsewhere))
