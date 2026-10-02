import { Command, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { expect, test } from 'vitest'

import { Message, WeatherAsyncData, update } from '../src/main.js'
import { weatherModel } from './main.fixture.js'

test('submitting while the weather is loading starts no second fetch', () => {
  story(
    update,
    given(modifyFields(weatherModel, { weather: () => WeatherAsyncData.Loading() })),
    message(Message.SubmittedWeatherForm()),
    Command.expectNone(),
    model(model => {
      expect(model.weather).toEqual(WeatherAsyncData.Loading())
    }),
  )
})
