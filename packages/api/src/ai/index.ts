import { AIProvider } from './provider';
import { OllamaProvider } from './ollama.provider';
import { OpenAIProvider } from './openai.provider';
import { HybridProvider } from './hybrid.provider';
import { getEnv } from '../config/env';
import { logger } from '../lib/logger';

export type ProviderType = 'openai' | 'ollama' | 'ollama-local';

// Cache keyed by provider type — each provider type gets its own singleton
const providerCache = new Map<ProviderType, AIProvider>();

export function getAIProvider(providerType: ProviderType = 'openai'): AIProvider {
  const cached = providerCache.get(providerType);
  if (cached) return cached;

  let provider: AIProvider;

  switch (providerType) {
    case 'openai':
      provider = new HybridProvider(new OpenAIProvider(), { useLocalForLowReason: true });
      logger.info('Initialized OpenAI provider with local Ollama offload');
      break;
    case 'ollama':
      provider = new HybridProvider(new OllamaProvider({ cloud: true }), {
        useLocalForLowReason: true,
      });
      logger.info('Initialized Ollama Cloud provider with local Ollama offload');
      break;
    case 'ollama-local':
      provider = new HybridProvider(new OllamaProvider({ cloud: false }), {
        useLocalForLowReason: false,
      });
      logger.info('Initialized Ollama Local provider (no offload)');
      break;
    default:
      throw new Error(`Unknown AI provider type: ${providerType}`);
  }

  providerCache.set(providerType, provider);
  return provider;
}

export function resetAIProvider(providerType?: ProviderType) {
  if (providerType) {
    providerCache.delete(providerType);
  } else {
    providerCache.clear();
  }
}

export function getDefaultProvider(): AIProvider {
  const env = getEnv();
  return getAIProvider('openai');
}
