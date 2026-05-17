import { expect, test } from 'bun:test'

import {
  XAI_OAUTH_AUTHORIZE_URL,
  XAI_OAUTH_TOKEN_URL,
} from './xaiOAuthShared.js'

test('xAI OAuth uses the discovered oauth2 endpoints', () => {
  expect(XAI_OAUTH_AUTHORIZE_URL).toBe('https://auth.x.ai/oauth2/authorize')
  expect(XAI_OAUTH_TOKEN_URL).toBe('https://auth.x.ai/oauth2/token')
})
