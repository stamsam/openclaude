import { defineGateway } from '../define.js'

export default defineGateway({
  id: 'omlx',
  label: 'oMLX',
  category: 'local',
  defaultBaseUrl: 'http://127.0.0.1:8000/v1',
  defaultModel: 'local-model',
  supportsModelRouting: true,
  setup: {
    requiresAuth: false,
    authMode: 'api-key',
    credentialEnvVars: ['OMLX_API_KEY'],
  },
  startup: {
    autoDetectable: true,
    probeReadiness: 'openai-compatible-models',
  },
  transportConfig: {
    kind: 'local',
    openaiShim: {
      supportsAuthHeaders: true,
      maxTokensField: 'max_tokens',
    },
  },
  preset: {
    id: 'omlx',
    description: 'Local oMLX endpoint',
    apiKeyEnvVars: ['OMLX_API_KEY', 'OPENAI_API_KEY'],
    baseUrlEnvVars: ['OPENAI_BASE_URL', 'OPENAI_API_BASE'],
    modelEnvVars: ['OPENAI_MODEL'],
    vendorId: 'openai',
  },
  catalog: {
    source: 'dynamic',
    discovery: {
      kind: 'openai-compatible',
      requiresAuth: false,
    },
    discoveryCacheTtl: '1d',
    discoveryRefreshMode: 'background-if-stale',
    allowManualRefresh: true,
  },
  usage: { supported: false },
  validation: {
    kind: 'credential-env',
    credentialEnvVars: ['OMLX_API_KEY', 'OPENAI_API_KEY'],
    allowLocalBaseUrlWithoutCredential: true,
    routing: {
      matchDefaultBaseUrl: true,
    },
  },
})
