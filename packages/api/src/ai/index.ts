import { AIProvider } from './provider';
import { OllamaProvider } from './ollama.provider';
import { OpenAIProvider } from './openai.provider';
import { GeminiProvider } from './gemini.provider';
import { HybridProvider } from './hybrid.provider';
import { getEnv } from '../config/env';
import { logger } from '../lib/logger';

export type ProviderType = 'openai' | 'gemini' | 'ollama';

// Cache keyed by provider type — each provider type gets its own singleton
const providerCache = new Map<ProviderType, AIProvider>();

export function getAIProvider(providerType: ProviderType = 'openai'): AIProvider {
  const cached = providerCache.get(providerType);
  if (cached) return cached;

  let provider: AIProvider;

  switch (providerType) {
    case 'openai':
      provider = new HybridProvider(new OpenAIProvider());
      logger.info('Initialized OpenAI provider with local Ollama offload');
      break;
    case 'gemini':
      provider = new HybridProvider(new GeminiProvider());
      logger.info('Initialized Gemini provider with local Ollama offload');
      break;
    case 'ollama':
      provider = new HybridProvider(new OllamaProvider({ cloud: true }));
      logger.info('Initialized Ollama Cloud provider with local Ollama offload');
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
