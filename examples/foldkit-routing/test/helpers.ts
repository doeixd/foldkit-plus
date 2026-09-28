import { Array, Option, String } from 'effect'
import { type Url, fromString } from 'foldkit/url'

import { AppRoute, Model } from '../src/main.js'
import { People } from '../src/page/index.js'

export const urlOrThrow = (raw: string): Url =>
  Option.getOrThrowWith(fromString(raw), () => new Error(`Failed to parse url: ${raw}`))

export const peoplePageWith = (searchInput: string): People.Model =>
  People.Model.make({
    searchInput,
    searchHistory: Array.liftPredicate(String.isNonEmpty)(searchInput),
    results: People.SearchResults.Loaded({
      query: searchInput,
      people: People.searchPeople(searchInput),
    }),
  })

/** The Model on `route`, with the People page as a first visit to `/people` leaves it. */
export const on = (route: AppRoute): Model => Model.make({ route, peoplePage: peoplePageWith('') })
