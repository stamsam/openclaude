import { defineAnthropicProxy } from '../define.js'

export default defineAnthropicProxy({
  id: 'omlx-anthropic',
  label: 'oMLX Anthropic',
  classification: 'anthropic-proxy',
  defaultBaseUrl: 'http://127.0.0.1:8000',
  defaultModel: 'local-model',
  setup: {
    requiresAuth: false,
    authMode: 'api-key',
    credentialEnvVars: ['OMLX_API_KEY', 'ANTHROPIC_API_KEY'],
  },
  envVarConfig: {
    authTokenEnvVar: 'ANTHROPIC_API_KEY',
    baseUrlEnvVar: 'ANTHROPIC_BASE_URL',
    modelEnvVar: 'ANTHROPIC_MODEL',
  },
  capabilities: {
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsReasoning: false,
  },
  transportConfig: {
    kind: 'anthropic-proxy',
  },
  preset: {
    id: 'omlx-anthropic',
    description: 'Local oMLX Anthropic-compatible endpoint',
    apiKeyEnvVars: ['OMLX_API_KEY', 'ANTHROPIC_API_KEY'],
    baseUrlEnvVars: ['ANTHROPIC_BASE_URL'],
    modelEnvVars: ['ANTHROPIC_MODEL'],
    vendorId: 'anthropic',
  },
  usage: { supported: false },
  validation: {
    kind: 'credential-env',
    credentialEnvVars: ['OMLX_API_KEY', 'ANTHROPIC_API_KEY'],
    allowLocalBaseUrlWithoutCredential: true,
    routing: {
      matchDefaultBaseUrl: true,
    },
  },
})
