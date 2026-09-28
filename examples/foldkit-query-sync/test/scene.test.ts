import { Option } from 'effect'
import { click, expect, given, placeholder, role, scene, selector, text, type } from 'foldkit/scene'
import { modifyFields } from 'foldkit/struct'
import { describe, test } from 'vitest'

import { AppRoute, initialModel, update, view } from '../src/main.js'
import { withSearch } from './helpers.js'

describe('view', () => {
  test('the Browse route renders the heading and search input', () => {
    scene(
      { update, view },
      given(initialModel),
      expect(role('heading', { name: 'Dinosaur Explorer' })).toExist(),
      expect(placeholder('Search by name…')).toExist(),
    )
  })

  test('rendering shows the total dinosaur count', () => {
    scene(
      { update, view },
      given(initialModel),
      expect(text('Showing', { exact: false })).toHaveText('Showing 22 of 22 dinosaurs'),
    )
  })

  test('the search field shows the Model search', () => {
    scene(
      { update, view },
      given(withSearch('Tyranno')),
      expect(placeholder('Search by name…')).toHaveValue('Tyranno'),
      expect(text('Showing', { exact: false })).toHaveText('Showing 1 of 22 dinosaurs'),
    )
  })

  test('typing in the search input filters the rows', () => {
    scene(
      { update, view },
      given(initialModel),
      type(placeholder('Search by name…'), 'raptor'),
      expect(text('Showing', { exact: false })).toHaveText('Showing 2 of 22 dinosaurs'),
      expect(role('cell', { name: 'Velociraptor' })).toExist(),
      expect(role('cell', { name: 'Triceratops' })).toBeAbsent(),
    )
  })

  test('diet and period filters narrow the rows together', () => {
    scene(
      { update, view },
      given(
        modifyFields(initialModel, {
          diet: () => Option.some('Carnivore' as const),
          period: () => Option.some('Jurassic' as const),
        }),
      ),
      expect(role('button', { name: 'Carnivore' })).toExist(),
      expect(role('button', { name: 'Jurassic' })).toExist(),
      expect(role('cell', { name: 'Allosaurus' })).toExist(),
      expect(role('cell', { name: 'Tyrannosaurus Rex' })).toBeAbsent(),
      expect(role('cell', { name: 'Stegosaurus' })).toBeAbsent(),
    )
  })

  test('clicking a column header cycles its sort and shows it', () => {
    scene(
      { update, view },
      given(initialModel),
      click(role('button', { name: 'Sort by Length' })),
      expect(role('button', { name: 'Sort by Length, currently ascending' })).toExist(),
      // The indicator sits before the label in a right-aligned column.
      expect(selector('th[aria-sort="ascending"]')).toHaveText('↑Length (m)'),
      click(role('button', { name: 'Sort by Length, currently ascending' })),
      expect(role('button', { name: 'Sort by Length, currently descending' })).toExist(),
      click(role('button', { name: 'Sort by Length, currently descending' })),
      expect(role('button', { name: 'Sort by Length' })).toExist(),
    )
  })

  test('a search with no matches shows the empty-state copy', () => {
    scene(
      { update, view },
      given(withSearch('zzzNoMatch')),
      expect(text('No dinosaurs match your filters.')).toExist(),
      expect(role('table')).toBeAbsent(),
    )
  })

  test('NotFound shows a friendly 404 and a back link', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, { route: () => AppRoute.NotFound({ path: '/oops' }) })),
      expect(role('heading', { name: '404 — Page Not Found' })).toExist(),
      expect(text('The path "/oops" was not found.')).toExist(),
      expect(role('link', { name: '← Back to Dinosaur Explorer' })).toHaveAttr('href', '/'),
    )
  })
})
