/**
 * `fetchWeatherEffect` against a fake `HttpClient`: the cases upstream's story
 * tests leave out. Open-Meteo's answers cross a decode before anything reads
 * them, and every way the fetch can fail ends in one `FailedFetchWeather`.
 */
import { Effect, Layer, Option } from 'effect'
import { HttpClient, HttpClientResponse, UrlParams } from 'effect/unstable/http'
import { expect, test } from 'vitest'

import { Message, fetchWeatherEffect } from '../src/main.js'
import { mockGeocodingResponse, mockWeatherResponse } from './main.fixture.js'

type Answer = Readonly<{ status: number; body: unknown }>

const ok = (body: unknown): Answer => ({ status: 200, body })

/** Runs the fetch against a server that answers the geocoder and the forecast as given, recording each URL. */
const fetchWith = async (zipCode: string, geocoding: Answer, forecast: Answer) => {
  const urls: Array<string> = []
  const client = HttpClient.make(request =>
    Effect.sync(() => {
      urls.push(`${request.url}?${UrlParams.toString(request.urlParams)}`)
      const { status, body } = request.url.includes('geocoding') ? geocoding : forecast
      return HttpClientResponse.fromWeb(request, new Response(JSON.stringify(body), { status }))
    }),
  )
  const message = await fetchWeatherEffect(zipCode).pipe(
    Effect.provide(Layer.succeed(HttpClient.HttpClient, client)),
    Effect.runPromise,
  )
  return { message, urls }
}

test.each([
  ['a blank zip code, before any request', '  ', ok(mockGeocodingResponse), 'Zip code required'],
  [
    'a geocoder answer that is not the expected shape',
    '90210',
    ok({ results: [{ name: 'Beverly Hills' }] }),
    'Failed to fetch weather data',
  ],
  ['a geocoder that answers 404', '90210', { status: 404, body: null }, 'Location not found'],
  [
    'a geocoder answer with no results field',
    '90210',
    ok({ generationtime_ms: 0.5 }),
    'Location not found',
  ],
])('fails with a message for %s', async (_, zipCode, geocoding, error) => {
  const { message } = await fetchWith(zipCode, geocoding, ok(mockWeatherResponse))
  expect(message).toEqual(Message.FailedFetchWeather({ error }))
})

test.each([
  ['a forecast that fails, whatever its body', { status: 500, body: mockWeatherResponse }],
  ['a forecast that is not the expected shape', ok({ current: { temperature_2m: 'warm' } })],
])('fails with a fixed sentence for %s', async (_, forecast) => {
  const { message } = await fetchWith('90210', ok(mockGeocodingResponse), forecast)
  expect(message).toEqual(Message.FailedFetchWeather({ error: 'Failed to fetch weather data' }))
})

test('sends no request for a blank zip code', async () => {
  const { urls } = await fetchWith('', ok(mockGeocodingResponse), ok(mockWeatherResponse))
  expect(urls).toEqual([])
})

test('asks the forecast for the coordinates the geocoder found, in Fahrenheit and mph', async () => {
  const { urls } = await fetchWith('90210', ok(mockGeocodingResponse), ok(mockWeatherResponse))
  expect(urls.map(url => Object.fromEntries(new URL(url).searchParams))).toMatchObject([
    { name: '90210' },
    {
      latitude: '34.07362',
      longitude: '-118.40036',
      temperature_unit: 'fahrenheit',
      wind_speed_unit: 'mph',
    },
  ])
})

test('keeps a place the geocoder names no region for without one', async () => {
  const { message } = await fetchWith(
    '90210',
    ok({ results: [{ name: 'Beverly Hills', latitude: 34.07362, longitude: -118.40036 }] }),
    ok(mockWeatherResponse),
  )
  expect(message).toMatchObject({
    _tag: 'SucceededFetchWeather',
    weather: { locationName: 'Beverly Hills', maybeRegion: Option.none() },
  })
})
