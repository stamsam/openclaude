import { defineVendor } from '../define.js'

export default defineVendor({
  id: 'xai',
  label: 'xAI',
  classification: 'openai-compatible',
  defaultBaseUrl: 'https://api.x.ai/v1',
  defaultModel: 'grok-4.3',
  requiredEnvVars: ['XAI_API_KEY'],
  baseUrlEnvVars: ['XAI_BASE_URL'],
  modelEnvVars: ['XAI_MODEL', 'OPENAI_MODEL'],
  setup: {
    requiresAuth: true,
    authMode: 'token',
    credentialEnvVars: ['XAI_API_KEY', 'XAI_OAUTH_ACCESS_TOKEN'],
  },
  transportConfig: {
    kind: 'openai-compatible',
  },
  preset: {
    id: 'xai',
    description: 'xAI Grok OpenAI-compatible endpoint',
    apiKeyEnvVars: ['XAI_API_KEY', 'XAI_OAUTH_ACCESS_TOKEN'],
    modelEnvVars: ['XAI_MODEL', 'OPENAI_MODEL'],
  },
  validation: {
    kind: 'credential-env',
    routing: {
      matchDefaultBaseUrl: true,
      matchBaseUrlHosts: ['api.x.ai'],
    },
    credentialEnvVars: ['XAI_API_KEY', 'XAI_OAUTH_ACCESS_TOKEN'],
    missingCredentialMessage:
      'XAI_API_KEY or xAI OAuth is required for the xAI provider.',
  },
  catalog: {
    source: 'static',
    models: [
      {
        id: 'grok-4.3',
        apiName: 'grok-4.3',
        label: 'Grok 4.3',
        modelDescriptorId: 'grok-4.3',
      },
      {
        id: 'grok-4',
        apiName: 'grok-4',
        label: 'Grok 4',
        modelDescriptorId: 'grok-4',
      },
      {
        id: 'grok-3',
        apiName: 'grok-3',
        label: 'Grok 3',
        modelDescriptorId: 'grok-3',
      },
    ],
  },
  usage: { supported: false },
})
