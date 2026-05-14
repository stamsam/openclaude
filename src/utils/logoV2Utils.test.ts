import { expect, test } from 'bun:test'

import { getProviderDisplayLabelForLogo } from './logoV2Utils.js'

test('getProviderDisplayLabelForLogo labels local oMLX instead of API billing', () => {
  expect(
    getProviderDisplayLabelForLogo({
      CLAUDE_CODE_USE_OPENAI: '1',
      OPENAI_BASE_URL: 'http://127.0.0.1:8000/v1',
    }),
  ).toBe('oMLX')
})

test('getProviderDisplayLabelForLogo leaves first-party Anthropic billing alone', () => {
  expect(getProviderDisplayLabelForLogo({})).toBeUndefined()
})
