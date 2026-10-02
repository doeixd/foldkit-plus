import { Command, expect, given, role, scene, submit, text } from 'foldkit/scene'
import { describe, test } from 'vitest'

import { SaveSession } from '../src/command.js'
import { Session } from '../src/domain/session.js'
import { Message } from '../src/message.js'
import { LoggedOut } from '../src/model.js'
import { Message as LoginMessage, SimulateAuthRequest } from '../src/page/loggedOut/page/login.js'
import { AppRoute } from '../src/route.js'
import { RedirectToDashboard, update } from '../src/update.js'
import { view } from '../src/view.js'
import { validLoginModel } from './fixtures.js'

const validModel = LoggedOut.Model({
  route: AppRoute.Login(),
  loginModel: validLoginModel,
})

const aliceSession = Session.make({
  userId: '1',
  email: 'alice@example.com',
  name: 'alice',
})

describe('login flow', () => {
  test('successful login saves the session and lands on the dashboard', () => {
    scene(
      { update, view },
      given(validModel),
      submit(role('form')),
      Command.expectExact(SimulateAuthRequest),
      Command.resolve(
        SimulateAuthRequest,
        LoginMessage.SucceededSimulateAuthRequest({ session: aliceSession }),
      ),
      Command.expectExact(SaveSession, RedirectToDashboard),
      Command.resolveAll(
        [SaveSession, Message.SucceededSaveSession()],
        [RedirectToDashboard, Message.CompletedNavigateInternal()],
      ),
      expect(text('Welcome back, alice!')).toExist(),
    )
  })
})
