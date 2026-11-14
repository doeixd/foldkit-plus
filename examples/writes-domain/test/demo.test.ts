// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { runDemo } from '../src/demo.js'

describe('foldkit-example-writes-domain', () => {
  it('runs each decision on SQLite, in memory and on the Domain model, and shows where the backends part', async () => {
    expect(await runDemo()).toEqual([
      'the owner reserves 3 at the revision read',
      '  sqlite: decision {"_tag":"Accepted"}; row {"reserved":5,"revision":2}; ledger [{"operation":"op-1"}]',
      '  memory: decision {"_tag":"Accepted"}; row {"reserved":5,"revision":2}',
      '  domain: decision {"_tag":"Accepted"}; row {"reserved":5,"revision":2}; commits 3; story "passed"',
      '  the three agree with the scenario',
      'reserving more than the stock is Invalid, naming reservedWithinStock',
      '  sqlite: decision {"_tag":"Refused","refusal":"Invalid Product.reservedWithinStock"}; row {"reserved":2,"revision":1}; ledger []',
      '  memory: decision {"_tag":"Refused","refusal":"Invalid Product.reservedWithinStock"}; row {"reserved":2,"revision":1}',
      '  domain: decision {"_tag":"Refused","refusal":"Invalid Product.reservedWithinStock"}; row {"reserved":2,"revision":1}; commits 2; story "passed"',
      '  the three agree with the scenario',
      'up to the stock exactly is accepted',
      '  sqlite: decision {"_tag":"Accepted"}; row {"reserved":10,"revision":2}; ledger [{"operation":"op-1"}]',
      '  memory: decision {"_tag":"Accepted"}; row {"reserved":10,"revision":2}',
      '  domain: decision {"_tag":"Accepted"}; row {"reserved":10,"revision":2}; commits 3; story "passed"',
      '  the three agree with the scenario',
      'a stale revision is a conflict',
      '  sqlite: decision {"_tag":"Refused","refusal":"Conflict"}; row {"reserved":2,"revision":1}; ledger []',
      '  memory: decision {"_tag":"Refused","refusal":"Conflict"}; row {"reserved":2,"revision":1}',
      '  domain: decision {"_tag":"Refused","refusal":"Conflict"}; row {"reserved":2,"revision":1}; commits 2; story "passed"',
      '  the three agree with the scenario',
      'a draft is unmet',
      '  sqlite: decision {"_tag":"Refused","refusal":"Unmet"}; row {"reserved":0,"revision":1}; ledger []',
      '  memory: decision {"_tag":"Refused","refusal":"Unmet"}; row {"reserved":0,"revision":1}',
      '  domain: decision {"_tag":"Refused","refusal":"Unmet"}; row {"reserved":0,"revision":1}; commits 2; story "passed"',
      '  the three agree with the scenario',
      'anyone but the owner is forbidden',
      '  sqlite: decision {"_tag":"Forbidden"}; row {"reserved":2,"revision":1}; ledger []',
      '  memory: decision {"_tag":"Forbidden"}; row {"reserved":2,"revision":1}',
      '  domain: decision {"_tag":"Forbidden"}; row {"reserved":2,"revision":1}; commits 2; story "passed"',
      '  the three agree with the scenario',
      'a visitor is forbidden',
      '  sqlite: decision {"_tag":"Refused","refusal":"Failed Unauthenticated"}; row {"reserved":2,"revision":1}; ledger []',
      '  memory: decision {"_tag":"Refused","refusal":"Failed Unauthenticated"}; row {"reserved":2,"revision":1}',
      '  domain: decision {"_tag":"Forbidden"}; row {"reserved":2,"revision":1}; commits 2; story "passed"',
      '  disagrees: sqlite / decision: expected {"_tag":"Forbidden"}, got {"_tag":"Refused","refusal":"Failed Unauthenticated"} | memory / decision: expected {"_tag":"Forbidden"}, got {"_tag":"Refused","refusal":"Failed Unauthenticated"}',
    ])
  })
})
