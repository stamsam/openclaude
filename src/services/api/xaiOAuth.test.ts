import { expect, test } from 'bun:test'

import { parseXaiOAuthCallbackInput } from './xaiOAuth.js'

test('parseXaiOAuthCallbackInput parses full xAI callback URLs', () => {
  expect(
    parseXaiOAuthCallbackInput(
      'http://127.0.0.1:56121/callback?state=oauth-state&code=oauth-code',
    ),
  ).toEqual({
    authorizationCode: 'oauth-code',
    state: 'oauth-state',
  })
})

test('parseXaiOAuthCallbackInput parses compact code and state input', () => {
  expect(parseXaiOAuthCallbackInput(' oauth-code # oauth-state ')).toEqual({
    authorizationCode: 'oauth-code',
    state: 'oauth-state',
  })
})

test('parseXaiOAuthCallbackInput rejects missing callback data', () => {
  expect(() =>
    parseXaiOAuthCallbackInput('http://127.0.0.1:56121/callback?code=oauth-code'),
  ).toThrow('Invalid xAI callback')
})
