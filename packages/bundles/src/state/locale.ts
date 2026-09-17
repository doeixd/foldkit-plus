/**
 * Locale as a bundle: the current locale string in the Model. Starts from
 * `navigator.language` where available, falling back to the configured
 * default; changes arrive as Messages. No subscriptions: language changes
 * take effect on reload.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'

export const LocaleModel = Schema.Struct({ locale: Schema.String })
export type LocaleModel = typeof LocaleModel.Type

export const LocaleMessage = defineMessageUnion({ SetLocale: { locale: Schema.String } })
export type LocaleMessage = typeof LocaleMessage.Type

export const Locale = Bundle.make('Locale', {
  Model: LocaleModel,
  Message: LocaleMessage,
  args: Schema.Struct({ default: Schema.String }),
  init: args => ({
    model: {
      locale:
        typeof navigator !== 'undefined' && typeof navigator.language === 'string'
          ? navigator.language
          : args.default,
    },
  }),
  update: (model, message) =>
    LocaleMessage.match(message, {
      SetLocale: ({ locale }) => ({ model: { ...model, locale } }),
    }),
})
