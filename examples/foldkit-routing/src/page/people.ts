import * as UiButton from '@foldkit/ui/button'
import * as UiInput from '@foldkit/ui/input'
import { Array, Duration, Effect, Option, Schema, String, pipe } from 'effect'
import { Command, Submodel, type Update } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { pushUrl } from 'foldkit/navigation'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Button, Input } from 'foldkit-mixins-ui'

import { AppRoute, type PeopleRoute, peopleRouter, personRouter } from '../route.js'
import { PeopleSlots, PeopleStyle, SearchButtonStyle, SearchInputStyle } from '../style.js'

// DOMAIN

const Person = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  role: Schema.String,
})
type Person = typeof Person.Type

const people: ReadonlyArray<Person> = [
  { id: 1, name: 'Alice Johnson', role: 'Designer' },
  { id: 2, name: 'Bob Smith', role: 'Developer' },
  { id: 3, name: 'Carol Davis', role: 'Manager' },
  { id: 4, name: 'David Wilson', role: 'Developer' },
  { id: 5, name: 'Eva Brown', role: 'Designer' },
]

const SEARCH_HISTORY_LIMIT = 5
const SEARCH_LATENCY = Duration.millis(300)

const matchesQuery = (person: Person, query: string): boolean => {
  const lowerQuery = query.toLowerCase()
  return (
    person.name.toLowerCase().includes(lowerQuery) || person.role.toLowerCase().includes(lowerQuery)
  )
}

export const searchPeople = (searchText: string): ReadonlyArray<Person> =>
  pipe(
    searchText,
    Option.liftPredicate(String.isNonEmpty),
    Option.match({
      onNone: () => people,
      onSome: query => Array.filter(people, person => matchesQuery(person, query)),
    }),
  )

const addSearchToHistory = (
  history: ReadonlyArray<string>,
  value: string,
): ReadonlyArray<string> => {
  if (String.isEmpty(value)) {
    return history
  }

  return Array.take(Array.dedupe([value, ...history]), SEARCH_HISTORY_LIMIT)
}

const routeSearchText = (route: PeopleRoute): string => Option.getOrElse(route.searchText, () => '')

export const findPerson = (id: number) => Array.findFirst(people, person => person.id === id)

// MODEL

export const SearchResults = defineTaggedUnion({
  Loading: {},
  Loaded: { query: Schema.String, people: Schema.Array(Person) },
})
export type SearchResults = typeof SearchResults.Type

export const Model = Schema.Struct({
  searchInput: Schema.String,
  searchHistory: Schema.Array(Schema.String),
  results: SearchResults,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ChangedSearchInput: { value: Schema.String },
  SubmittedSearch: {},
  ChangedRoute: { route: AppRoute.People },
  SucceededFetchPeople: {
    query: Schema.String,
    people: Schema.Array(Person),
  },
  CompletedPushSearchUrl: {},
})

export type Message = typeof Message.Type

// INIT

type InitReturn = Update.Return<Model, Message>

export const init = (route: PeopleRoute): InitReturn => {
  const searchText = routeSearchText(route)
  return {
    model: {
      searchInput: searchText,
      searchHistory: addSearchToHistory([], searchText),
      results: SearchResults.Loading(),
    },
    commands: [FetchPeople({ searchText })],
  }
}

// COMMAND

export const PushSearchUrl = Command.define('PushSearchUrl', {
  args: { searchText: Schema.Option(Schema.String) },
  messages: [Message.CompletedPushSearchUrl],
  execute: ({ searchText }) =>
    pushUrl(peopleRouter({ searchText })).pipe(Effect.as(Message.CompletedPushSearchUrl())),
})

export const FetchPeople = Command.define('FetchPeople', {
  args: { searchText: Schema.String },
  messages: [Message.SucceededFetchPeople],
  execute: ({ searchText }) =>
    Effect.sleep(SEARCH_LATENCY).pipe(
      Effect.as(
        Message.SucceededFetchPeople({
          query: searchText,
          people: searchPeople(searchText),
        }),
      ),
    ),
})

// UPDATE

export type UpdateReturn = Update.Return<Model, Message>

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ChangedSearchInput: ({ value }) => ({
      model: modifyFields(model, { searchInput: () => value }),
    }),

    SubmittedSearch: () => ({
      model,
      commands: [
        PushSearchUrl({
          searchText: Option.liftPredicate(model.searchInput, String.isNonEmpty),
        }),
      ],
    }),

    ChangedRoute: ({ route }) => {
      const searchText = routeSearchText(route)
      return {
        model: modifyFields(model, {
          searchInput: () => searchText,
          searchHistory: searchHistory => addSearchToHistory(searchHistory, searchText),
          results: () => SearchResults.Loading(),
        }),
        commands: [FetchPeople({ searchText })],
      }
    },

    SucceededFetchPeople: ({ query, people: fetchedPeople }) => ({
      model: modifyFields(model, {
        results: () => SearchResults.Loaded({ query, people: fetchedPeople }),
      }),
    }),

    CompletedPushSearchUrl: () => ({ model }),
  })

/** Tells the People page that the route changed. People does not own the
 *  route; it derives its own state (the search input and history) from the new
 *  route and returns the refetch Command. The parent calls this from its
 *  `ChangedUrl` handler. Contrast a `reflect*` setter, which writes a field the
 *  Submodel owns from an external value, with no derivation and no Command. */
export const informRouteChanged = (model: Model, route: PeopleRoute) =>
  update(model, Message.ChangedRoute({ route }))

// VIEW

type Slots = SlotBuilders<typeof PeopleSlots, Message>

const statusText = (results: SearchResults): string =>
  SearchResults.match<string>(results, {
    Loading: () => 'Searching…',
    Loaded: ({ query, people: found }) => {
      if (String.isEmpty(query)) {
        return 'Click on any person to view their details:'
      }

      const count = Array.length(found)
      const noun = count === 1 ? 'result' : 'results'
      return `${count} ${noun} for “${query}”`
    },
  })

const recentSearchesView = (
  history: ReadonlyArray<string>,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(slots.history.attrs(), [
    h.span(slots.historyLabel.attrs(), ['Recent searches:']),
    ...Array.map(history, term => h.keyed('span')(term, slots.historyTerm.attrs(), [term])),
  ])

const personListItemView = (person: Person, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.keyed('li')(person.id.toString(), slots.person.attrs(), [
    h.a(slots.personLink.attrs([h.Href(personRouter({ personId: person.id }))]), [
      h.div(slots.personRow.attrs(), [
        h.h2(slots.personName.attrs(), [person.name]),
        h.p(slots.personRole.attrs(), [person.role]),
      ]),
    ]),
  ])

const searchView = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.search(slots.search.attrs(), [
    h.form(slots.form.attrs([h.OnSubmit(Message.SubmittedSearch())]), [
      UiInput.view(
        {
          id: 'people-search',
          type: 'search',
          value: model.searchInput,
          placeholder: 'Search by name or role...',
          onInput: value => Message.ChangedSearchInput({ value }),
          toView: attributes => {
            const { input, label } = Input.resolve(attributes, [SearchInputStyle.mixin], {
              input: undefined,
              h,
            })
            return h.div(slots.field.attrs(), [
              h.label(label, ['Search people']),
              h.input([...input, h.Autocomplete('off')]),
            ])
          },
        },
        h,
      ),
      UiButton.view(
        {
          type: 'submit',
          toView: attributes =>
            h.button(
              Button.resolve(attributes, [SearchButtonStyle.mixin], { input: undefined, h }).button,
              ['Search'],
            ),
        },
        h,
      ),
    ]),
  ])

/** The page, drawn through its own Slots: `h` here is the Submodel's, typed by People's Message. */
export const PeoplePage = SlotView.forMessages<Message>()
  .define(PeopleSlots, (model: Model, slots, h) =>
    h.div(slots.content.attrs(), [
      h.h1(slots.heading.attrs(), ['People']),

      searchView(model, slots, h),

      Array.match(model.searchHistory, {
        onEmpty: () => h.empty,
        onNonEmpty: history => recentSearchesView(history, slots, h),
      }),

      h.p(slots.status.attrs([h.AriaLive('polite')]), [statusText(model.results)]),

      SearchResults.match(model.results, {
        Loading: () => h.empty,
        Loaded: ({ people: results }) =>
          h.ul(
            slots.people.attrs(),
            Array.map(results, person => personListItemView(person, slots, h)),
          ),
      }),
    ]),
  )
  .pipe(Style.attach(PeopleStyle))

export const view = Submodel.defineView<Model, Message>(PeoplePage)
