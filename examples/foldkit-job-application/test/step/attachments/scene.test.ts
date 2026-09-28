import { expect, given, role, scene, text } from 'foldkit/scene'
import { describe, test } from 'vitest'

import { init, update } from '../../../src/step/attachments/attachments.js'
import { view } from '../../../src/step/attachments/view.js'

describe('attachments', () => {
  test('renders the resume and additional-files drop zones', () => {
    scene(
      { update, view },
      given(init()),
      expect(role('heading', { name: 'Resume (PDF)' })).toExist(),
      expect(text('Drop your resume or click to upload')).toExist(),
      expect(role('heading', { name: 'Additional Files (optional)' })).toExist(),
    )
  })
})
