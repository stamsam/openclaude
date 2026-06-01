import { defineGateway } from '../define.js'

export default defineGateway({
  id: 'sams-auto-router',
  label: "Sam's Auto Router",
  category: 'local',
  defaultBaseUrl: 'http://127.0.0.1:8001/v1',
  defaultModel: 'Sams auto router 4B-35B',
  supportsModelRouting: true,
  setup: {
    requiresAuth: false,
    authMode: 'api-key',
    credentialEnvVars: ['OPENAI_API_KEY'],
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
    id: 'sams-auto-router',
    description: 'Local 4B-35B oMLX auto-router',
    label: "Sam's Auto Router",
    name: "Sam's Auto Router 4B-35B",
    apiKeyEnvVars: ['OPENAI_API_KEY'],
    baseUrlEnvVars: ['OPENAI_BASE_URL', 'OPENAI_API_BASE'],
    modelEnvVars: ['OPENAI_MODEL'],
    vendorId: 'openai',
  },
  catalog: {
    source: 'static',
    models: [
      {
        id: 'sams-auto-router-4b-35b',
        apiName: 'Sams auto router 4B-35B',
        label: 'Sams auto router 4B-35B',
        modelDescriptorId: 'sams-auto-router-4b-35b',
        notes: 'Routes normal work to 4B and escalates hard/review prompts to 35B.',
      },
    ],
  },
  usage: { supported: false },
  validation: {
    kind: 'credential-env',
    credentialEnvVars: ['OPENAI_API_KEY'],
    allowLocalBaseUrlWithoutCredential: true,
    routing: {
      matchDefaultBaseUrl: true,
    },
  },
})
