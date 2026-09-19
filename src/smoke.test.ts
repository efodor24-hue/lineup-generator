// Proves the test runner is wired up and runs TypeScript.
// Real tests start with the solver behavior scenarios (ELL-226); this file goes away then.
import { describe, expect, it } from 'vitest'

describe('test runner', () => {
  it('runs a typescript test file', () => {
    const rounds = [1, 2, 3, 4, 5, 6, 7]
    expect(rounds).toHaveLength(7)
  })
})
