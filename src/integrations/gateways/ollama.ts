import { defineGateway } from '../define.js'

export default defineGateway({
  id: 'ollama',
  label: 'Ollama',
  category: 'local',
  defaultBaseUrl: 'http://localhost:11434/v1',
  defaultModel: 'llama3.1:8b',
  supportsModelRouting: true,
  setup: {
    requiresAuth: false,
    authMode: 'none',
  },
  startup: {
    autoDetectable: true,
    probeReadiness: 'ollama-generation',
  },
  transportConfig: {
    kind: 'local',
    openaiShim: {
      supportsAuthHeaders: true,
      maxTokensField: 'max_tokens',
    },
  },
  preset: {
    id: 'ollama',
    description: 'Local or remote Ollama endpoint',
    modelEnvVars: ['OPENAI_MODEL'],
    vendorId: 'openai',
  },
  catalog: {
    source: 'hybrid',
    discovery: { kind: 'ollama' },
    discoveryCacheTtl: '1d',
    discoveryRefreshMode: 'manual',
    allowManualRefresh: true,
    models: [
      { id: 'minimax-m3-cloud', apiName: 'minimax-m3:cloud', label: 'MiniMax M3 (Ollama Cloud)', modelDescriptorId: 'minimax-m3' },
    ],
  },
  usage: { supported: false },
})
