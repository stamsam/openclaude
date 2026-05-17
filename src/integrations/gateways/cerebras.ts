import { defineGateway } from '../define.js'

export default defineGateway({
  id: 'cerebras',
  label: 'Cerebras',
  category: 'aggregating',
  defaultBaseUrl: 'https://api.cerebras.ai/v1',
  defaultModel: 'qwen-3-235b-a22b-instruct-2507',
  supportsModelRouting: true,
  setup: {
    requiresAuth: true,
    authMode: 'api-key',
    credentialEnvVars: ['CEREBRAS_API_KEY'],
  },
  startup: {
    probeReadiness: 'openai-compatible-models',
  },
  transportConfig: {
    kind: 'openai-compatible',
    openaiShim: {
      supportsAuthHeaders: true,
      removeBodyFields: ['store'],
    },
  },
  preset: {
    id: 'cerebras',
    description: 'Cerebras OpenAI-compatible endpoint',
    apiKeyEnvVars: ['CEREBRAS_API_KEY'],
    vendorId: 'openai',
  },
  validation: {
    kind: 'credential-env',
    routing: {
      matchBaseUrlHosts: ['api.cerebras.ai'],
    },
    credentialEnvVars: ['CEREBRAS_API_KEY'],
    missingCredentialMessage:
      'CEREBRAS_API_KEY is required for the Cerebras provider.',
  },
  catalog: {
    source: 'hybrid',
    discovery: { kind: 'openai-compatible' },
    discoveryCacheTtl: '1d',
    discoveryRefreshMode: 'background-if-stale',
    allowManualRefresh: true,
    models: [
      {
        id: 'cerebras-gpt-oss-120b',
        apiName: 'gpt-oss-120b',
        label: 'GPT-OSS 120B',
        modelDescriptorId: 'gpt-oss-120b',
        contextWindow: 131072,
        maxOutputTokens: 8192,
        notes: 'Agent/tool candidate; free tier may be rate-limited',
      },
      {
        id: 'cerebras-llama3.1-8b',
        apiName: 'llama3.1-8b',
        label: 'Llama 3.1 8B',
        modelDescriptorId: 'llama3.1:8b',
        contextWindow: 8192,
        maxOutputTokens: 2048,
        notes: '8K Cerebras limit; use for short chats only',
      },
      {
        id: 'cerebras-qwen-3-235b-a22b-instruct-2507',
        apiName: 'qwen-3-235b-a22b-instruct-2507',
        label: 'Qwen 3 235B A22B Instruct',
        modelDescriptorId: 'qwen-3-235b-a22b-instruct-2507',
        contextWindow: 131072,
        maxOutputTokens: 8192,
        notes: 'Available preview; validate tool use in agent mode',
      },
      {
        id: 'cerebras-zai-glm-4.7',
        apiName: 'zai-glm-4.7',
        label: 'Z.ai GLM 4.7',
        modelDescriptorId: 'glm-4.7',
        contextWindow: 131072,
        maxOutputTokens: 8192,
        notes: 'Preview reasoning model; free tier may be rate-limited',
      },
    ],
  },
  usage: { supported: false },
})
