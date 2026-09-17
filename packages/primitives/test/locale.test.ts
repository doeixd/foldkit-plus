// @vitest-environment jsdom
/**
 * Locale: navigator default, configured fallback, switching, and placement
 * through a real assembly.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { afterEach, describe, expect, it } from 'vitest'
import { Locale, LocaleMessage } from '../src/state/index.js'

const Lang = Bundle.declare(Locale, 'lang')
const Model = Schema.Struct({ ...Lang.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Lang.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placed = Page.at(Lang, { args: { default: 'en' } })

const fold = (model: Model, message: Parameters<typeof Lang.wrapper.make>[0]) =>
  Option.getOrThrow(placed.update(model, Lang.wrapper.make(message))).model.lang

afterEach(() => {
  Object.defineProperty(window.navigator, 'language', { value: 'en-US', configurable: true })
})

describe('Locale transitions', () => {
  it('starts from navigator.language, falling back to the default', () => {
    Object.defineProperty(window.navigator, 'language', { value: 'fr-FR', configurable: true })
    expect(placed.init({ lang: { locale: 'en' } }).model.lang).toEqual({ locale: 'fr-FR' })
    Object.defineProperty(window.navigator, 'language', { value: undefined, configurable: true })
    expect(placed.init({ lang: { locale: 'en' } }).model.lang).toEqual({ locale: 'en' })
  })

  it('switches on SetLocale', () => {
    expect(fold({ lang: { locale: 'en' } }, LocaleMessage.SetLocale({ locale: 'de' }))).toEqual({
      locale: 'de',
    })
  })
})

describe('Locale in an assembly', () => {
  it('routes its Messages and carries init', () => {
    const assembly = Page.assemble(Page.at(Lang, { args: { default: 'en' } }))
    const update = assembly.update(model => ({ model }))
    const switched = update(
      { lang: { locale: 'en' } },
      Lang.wrapper.make(LocaleMessage.SetLocale({ locale: 'de' })),
    )
    expect(switched.model.lang).toEqual({ locale: 'de' })
    expect(Object.keys(assembly.subscriptions())).toEqual([])
  })
})
