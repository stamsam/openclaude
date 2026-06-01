import { defineGateway } from '../define.js'

export default defineGateway({
  id: 'opencode-zen',
  label: 'OpenCode Zen',
  category: 'aggregating',
  defaultBaseUrl: 'https://opencode.ai/zen/v1',
  supportsModelRouting: true,
  setup: {
    requiresAuth: true,
    authMode: 'api-key',
    credentialEnvVars: ['ZEN_API_KEY'],
  },
  startup: {
    probeReadiness: 'openai-compatible-models',
  },
  transportConfig: {
    kind: 'openai-compatible',
    openaiShim: {
      supportsAuthHeaders: true,
    },
  },
  preset: {
    id: 'opencode-zen',
    description: 'OpenCode Zen OpenAI-compatible endpoint',
    apiKeyEnvVars: ['ZEN_API_KEY'],
    vendorId: 'openai',
  },
  catalog: {
    source: 'static',
    models: [
      { id: 'opencode-minimax-m3-free', apiName: 'minimax-m3-free', label: 'MiniMax M3 (via OpenCode Zen Free)', modelDescriptorId: 'minimax-m3' },
    ],
  },
  usage: { supported: false },
})