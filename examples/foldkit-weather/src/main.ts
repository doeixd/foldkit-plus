import * as UiButton from '@foldkit/ui/button'
import * as UiInput from '@foldkit/ui/input'
import { Array, Effect, Match, Option, Schema, String } from 'effect'
import { HttpClient, HttpClientRequest } from 'effect/unstable/http'
import { AsyncData, Command, Http, type Runtime, type Update } from 'foldkit'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Button, Input } from 'foldkit-mixins-ui'

import { SubmitButtonStyle, WeatherSlots, WeatherStyle, ZipCodeInputStyle } from './style.js'

// MODEL

export const WeatherData = Schema.Struct({
  zipCode: Schema.String,
  temperature: Schema.Number,
  description: Schema.String,
  humidity: Schema.Number,
  windSpeed: Schema.Number,
  locationName: Schema.String,
  // The geocoder leaves `admin1` out for some places. The Model is never
  // stored, so the absence stays an `Option` rather than becoming `''`.
  maybeRegion: Schema.Option(Schema.String),
})
export type WeatherData = typeof WeatherData.Type

export const WeatherAsyncData = AsyncData.Schema(WeatherData, Schema.String)

export const Model = Schema.Struct({
  zipCodeInput: Schema.String,
  weather: WeatherAsyncData.schema,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  UpdatedZipCodeInput: { value: Schema.String },
  SubmittedWeatherForm: {},
  SucceededFetchWeather: { weather: WeatherData },
  FailedFetchWeather: { error: Schema.String },
})
export type Message = typeof Message.Type

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    UpdatedZipCodeInput: ({ value }) => ({
      model: modifyFields(model, {
        zipCodeInput: () => value,
      }),
    }),

    SubmittedWeatherForm: () => {
      if (AsyncData.isPending(model.weather)) {
        return { model }
      }
      return {
        model: modifyFields(model, {
          weather: () => WeatherAsyncData.Loading(),
        }),
        commands: [FetchWeather({ zipCode: model.zipCodeInput })],
      }
    },

    SucceededFetchWeather: ({ weather }) => ({
      model: modifyFields(model, {
        weather: () => WeatherAsyncData.Success({ data: weather }),
      }),
    }),

    FailedFetchWeather: ({ error }) => ({
      model: modifyFields(model, {
        weather: () => WeatherAsyncData.Failure({ error }),
      }),
    }),
  })

// INIT

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: {
    zipCodeInput: '',
    weather: WeatherAsyncData.Idle(),
  },
})

// COMMAND

const GEOCODING_API = 'https://geocoding-api.open-meteo.com/v1/search'
const WEATHER_API = 'https://api.open-meteo.com/v1/forecast'

// Open-Meteo's answers are untrusted input: each is decoded before any field
// of it is read.

const GeocodingResult = Schema.Struct({
  name: Schema.String,
  latitude: Schema.Number,
  longitude: Schema.Number,
  admin1: Schema.OptionFromOptional(Schema.String),
})

const GeocodingResponse = Schema.Struct({
  results: Schema.OptionFromOptional(Schema.Array(GeocodingResult)),
})

const WeatherResponse = Schema.Struct({
  current: Schema.Struct({
    temperature_2m: Schema.Number,
    relative_humidity_2m: Schema.Number,
    wind_speed_10m: Schema.Number,
    weather_code: Schema.Number,
  }),
})

const weatherCodeToDescription = (code: number): string =>
  Match.value(code).pipe(
    Match.when(0, () => 'Clear sky'),
    Match.whenOr(1, 2, 3, () => 'Partly cloudy'),
    Match.whenOr(45, 48, () => 'Foggy'),
    Match.whenOr(51, 53, 55, () => 'Drizzle'),
    Match.whenOr(61, 63, 65, () => 'Rain'),
    Match.whenOr(66, 67, () => 'Freezing rain'),
    Match.whenOr(71, 73, 75, 77, () => 'Snow'),
    Match.whenOr(80, 81, 82, () => 'Rain showers'),
    Match.whenOr(85, 86, () => 'Snow showers'),
    Match.whenOr(95, 96, 99, () => 'Thunderstorm'),
    Match.orElse(() => 'Unknown'),
  )

export const fetchWeatherEffect = (zipCode: string) =>
  Effect.gen(function* () {
    if (String.isEmpty(zipCode.trim())) {
      return yield* Effect.fail(Message.FailedFetchWeather({ error: 'Zip code required' }))
    }

    const client = yield* HttpClient.HttpClient

    const geocodeRequest = HttpClientRequest.get(GEOCODING_API).pipe(
      HttpClientRequest.setUrlParams({
        name: zipCode,
        count: '1',
        language: 'en',
        format: 'json',
      }),
    )
    const geocodeResponse = yield* client.execute(geocodeRequest)

    if (geocodeResponse.status !== 200) {
      return yield* Effect.fail(Message.FailedFetchWeather({ error: 'Location not found' }))
    }

    const geocodeData = yield* Schema.decodeUnknownEffect(GeocodingResponse)(
      yield* geocodeResponse.json,
    )

    const geoResult = yield* geocodeData.results.pipe(
      Option.flatMap(Array.head),
      Option.match({
        onNone: () => Effect.fail(Message.FailedFetchWeather({ error: 'Location not found' })),
        onSome: Effect.succeed,
      }),
    )

    const weatherRequest = HttpClientRequest.get(WEATHER_API).pipe(
      HttpClientRequest.setUrlParams({
        latitude: geoResult.latitude.toString(),
        longitude: geoResult.longitude.toString(),
        current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code',
        temperature_unit: 'fahrenheit',
        wind_speed_unit: 'mph',
      }),
    )
    const weatherResponse = yield* client.execute(weatherRequest)

    if (weatherResponse.status !== 200) {
      return yield* Effect.fail(
        Message.FailedFetchWeather({ error: 'Failed to fetch weather data' }),
      )
    }

    const weatherData = yield* Schema.decodeUnknownEffect(WeatherResponse)(
      yield* weatherResponse.json,
    )

    const weather = WeatherData.make({
      zipCode,
      temperature: Math.round(weatherData.current.temperature_2m),
      description: weatherCodeToDescription(weatherData.current.weather_code),
      humidity: weatherData.current.relative_humidity_2m,
      windSpeed: Math.round(weatherData.current.wind_speed_10m),
      locationName: geoResult.name,
      maybeRegion: geoResult.admin1,
    })

    return Message.SucceededFetchWeather({ weather })
  }).pipe(
    Effect.catchTag('FailedFetchWeather', error => Effect.succeed(error)),
    // A transport or decode failure reaches the page as one fixed sentence,
    // never as the error's own text.
    Effect.catch(() =>
      Effect.succeed(Message.FailedFetchWeather({ error: 'Failed to fetch weather data' })),
    ),
  )

export const FetchWeather = Command.define('FetchWeather', {
  args: { zipCode: Schema.String },
  messages: [Message.SucceededFetchWeather, Message.FailedFetchWeather],
  execute: ({ zipCode }) => Effect.provide(fetchWeatherEffect(zipCode), Http.layer),
})

// VIEW

type Slots = SlotBuilders<typeof WeatherSlots, Message>

const locationLabel = (weather: WeatherData): string =>
  Option.match(weather.maybeRegion, {
    onNone: () => weather.locationName,
    onSome: region => `${weather.locationName}, ${region}`,
  })

export const Weather = SlotView.forMessages<Message>()
  .define(WeatherSlots, (model: Model, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h1(slots.title.attrs(), ['Weather']),

      h.form(slots.form.attrs([h.OnSubmit(Message.SubmittedWeatherForm())]), [
        zipCodeInputView(model, h),
        submitButtonView(model, h),
      ]),

      AsyncData.matchDataSplitEmpty(model.weather, {
        onIdle: () => h.empty,
        onLoading: () => h.div(slots.loading.attrs(), ['Fetching weather...']),
        onFailure: error => h.div(slots.error.attrs(), [error]),
        onData: weather => h.div(slots.result.attrs(), [weatherView(weather, slots, h)]),
      }),
    ]),
  )
  .pipe(Style.attach(WeatherStyle))

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Weather',
  body: Weather(model, h),
})

const zipCodeInputView = (model: Model, h: HtmlBuilder<Message>): Html =>
  UiInput.view(
    {
      id: 'location',
      value: model.zipCodeInput,
      placeholder: 'Enter a zip code',
      onInput: value => Message.UpdatedZipCodeInput({ value }),
      toView: attributes =>
        h.input([
          ...Input.resolve(attributes, [ZipCodeInputStyle.mixin], { input: undefined, h }).input,
          h.Autocomplete('off'),
          h.DataAttribute('1p-ignore', ''),
          h.AriaLabel('Zip code'),
        ]),
    },
    h,
  )

const submitButtonView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const isPending = AsyncData.isPending(model.weather)

  return UiButton.view(
    {
      type: 'submit',
      isDisabled: isPending,
      toView: attributes =>
        h.button(
          Button.resolve(attributes, [SubmitButtonStyle.mixin], { input: undefined, h }).button,
          [isPending ? 'Loading...' : 'Get Weather'],
        ),
    },
    h,
  )
}

const weatherView = (weather: WeatherData, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.article(slots.card.attrs(), [
    h.h2(slots.zipCode.attrs(), [weather.zipCode]),
    h.p(slots.location.attrs(), [locationLabel(weather)]),

    h.div(slots.current.attrs(), [
      h.div(slots.temperature.attrs(), [`${weather.temperature}°F`]),
      h.div(slots.description.attrs(), [weather.description]),
    ]),

    h.div(slots.details.attrs(), [
      detailView('Humidity', `${weather.humidity}%`, slots, h),
      detailView('Wind Speed', `${weather.windSpeed} mph`, slots, h),
    ]),
  ])

const detailView = (label: string, value: string, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.detail.attrs(), [
    h.div(slots.detailLabel.attrs(), [label]),
    h.div(slots.detailValue.attrs(), [value]),
  ])
