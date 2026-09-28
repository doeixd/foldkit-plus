import { FieldValidation } from 'foldkit'
import { modifyFields } from 'foldkit/struct'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, test } from 'vitest'

import { Session } from '../src/domain/session.js'
import { LoggedIn, LoggedOut } from '../src/model.js'
import { LoggedInPage } from '../src/page/loggedIn/view.js'
import { LoggedOutPage } from '../src/page/loggedOut/view.js'
import { LoginPage, type Model as LoginModel, initModel } from '../src/page/loggedOut/page/login.js'
import { AppRoute } from '../src/route.js'
import { stylesheet } from '../src/style.js'
import { validLoginModel } from './fixtures.js'

const alice = Session.make({ userId: '1', email: 'alice@example.com', name: 'alice' })

/** The Login page with a valid email and a refused password, as a failed sign-in leaves it. */
const refusedLoginModel: LoginModel = modifyFields(validLoginModel, {
  form: form => ({
    ...form,
    fields: {
      ...form.fields,
      password: FieldValidation.Invalid({ value: 'nope', errors: ['Invalid credentials'] }),
    },
  }),
})

const loggedInOn = (route: LoggedIn.Model['route']) =>
  Inert.draw(LoggedInPage, LoggedIn.init(route, alice))

/**
 * Every page but the Login route of the logged-out side, which it draws
 * through `h.submodel`: an inert draw has no runtime frame to place it in, so
 * the Login page is drawn alone.
 */
const trees = [
  Inert.draw(LoggedOutPage, LoggedOut.init(AppRoute.Home())),
  Inert.draw(LoggedOutPage, LoggedOut.init(AppRoute.NotFound({ path: '/missing' }))),
  Inert.draw(LoginPage, initModel()),
  Inert.draw(LoginPage, validLoginModel),
  Inert.draw(LoginPage, refusedLoginModel),
  Inert.draw(LoginPage, modifyFields(validLoginModel, { isSubmitting: () => true })),
  loggedInOn(AppRoute.Dashboard()),
  loggedInOn(AppRoute.Settings()),
  loggedInOn(AppRoute.NotFound({ path: '/missing' })),
]

describe('the pages', () => {
  test('draw every element through a Slot, so a Style can reach all of it', () => {
    for (const tree of trees) expect(Inert.unslotted(tree)).toEqual([])
  })

  test('ship every theme token the drawn styles read in the stylesheet', () => {
    for (const tree of trees) {
      expect(Inert.css(Inert.all(tree))).toContain('var(--fk-')
      expect(Inert.missingTokens(tree, stylesheet)).toEqual([])
    }
  })
})

describe('the Login page', () => {
  test('borders a valid field green and leaves an untouched one alone', () => {
    const valid = Inert.byTag(Inert.draw(LoginPage, validLoginModel), 'input')
    const idle = Inert.byTag(Inert.draw(LoginPage, initModel()), 'input')
    expect(valid).toHaveLength(2)
    for (const input of valid) expect(Inert.css([input])).toContain('var(--fk-success-default)')
    for (const input of idle) expect(Inert.css([input])).not.toContain('var(--fk-success-default)')
  })

  test('marks a refused password invalid and describes it with the reason', () => {
    const tree = Inert.draw(LoginPage, refusedLoginModel)
    const [, password] = Inert.byTag(tree, 'input')
    expect(Inert.value(password!, 'aria-invalid')).toBe('true')
    const describedBy = Inert.value(password!, 'aria-describedby')
    const description = Inert.all(tree).find(node => Inert.value(node, 'id') === describedBy)
    expect(description && Inert.text(description)).toBe('Invalid credentials')
  })

  test.each([
    ['empty', initModel(), 'Sign In', true],
    ['valid', validLoginModel, 'Sign In', false],
    [
      'submitting',
      modifyFields(validLoginModel, { isSubmitting: () => true }),
      'Signing in...',
      true,
    ],
  ])('the %s form draws its button as upstream does', (_, model, label, disabled) => {
    const [button] = Inert.byTag(Inert.draw(LoginPage, model), 'button')
    expect(Inert.text(button!)).toBe(label)
    expect(Inert.value(button!, 'aria-disabled') === 'true').toBe(disabled)
  })
})

describe('the logged-in navigation', () => {
  test.each([
    [AppRoute.Dashboard(), ['Dashboard']],
    [AppRoute.Settings(), ['Settings']],
    [AppRoute.NotFound({ path: '/missing' }), []],
  ])('on %o marks %o as the current page', (route, current) => {
    const links = Inert.all(loggedInOn(route)).filter(
      node => Inert.value(node, 'aria-current') === 'page',
    )
    expect(links.map(Inert.text)).toEqual(current)
  })
})
