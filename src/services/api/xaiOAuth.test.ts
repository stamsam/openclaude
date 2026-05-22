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

test('parseXaiOAuthCallbackInput parses raw query input', () => {
  expect(
    parseXaiOAuthCallbackInput('?code=oauth-code&state=oauth-state'),
  ).toEqual({
    authorizationCode: 'oauth-code',
    state: 'oauth-state',
  })
})

test('parseXaiOAuthCallbackInput accepts bare manual authorization codes', () => {
  expect(parseXaiOAuthCallbackInput('abc_DEF-1234567890abc_DEF')).toEqual({
    authorizationCode: 'abc_DEF-1234567890abc_DEF',
  })
})

test('parseXaiOAuthCallbackInput accepts URL callbacks without state for manual recovery', () => {
  expect(() =>
    parseXaiOAuthCallbackInput('http://127.0.0.1:56121/callback?code=oauth-code'),
  ).not.toThrow()
})

test('parseXaiOAuthCallbackInput rejects missing callback data', () => {
  expect(() =>
    parseXaiOAuthCallbackInput('http://127.0.0.1:56121/callback?state=oauth-state'),
  ).toThrow('Invalid xAI callback')
})
