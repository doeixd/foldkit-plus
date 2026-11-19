import { Locale, LocaleMessage } from 'foldkit-primitives/state'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

const LOCALES = ['en-US', 'de-DE', 'ja-JP']

// The Model holds a locale tag; every formatter in the view reads it from there.
export default primitiveExample({
  title: 'Locale',
  text: '`Locale` is the reader’s locale in the Model, set by a Message. It starts from `navigator.language` in the browser.',
  state: Locale.with({ default: 'en-US' }),
  view: ({ model, onMessage, slots, h }) =>
    h.p(
      [],
      [
        ...LOCALES.map(locale =>
          h.button(
            slots.liveButton.attrs([
              h.Type('button'),
              h.AriaPressed(String(model.locale === locale)),
              h.OnClick(onMessage(LocaleMessage.SetLocale({ locale }))),
            ]),
            [locale],
          ),
        ),
        ` ${new Date(Date.UTC(2026, 10, 18)).toLocaleDateString(model.locale, { timeZone: 'UTC', dateStyle: 'long' })}, ${(1234567.5).toLocaleString(model.locale)}`,
      ],
    ),
})
