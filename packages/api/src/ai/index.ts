import { AIProvider } from './provider';
import { OllamaProvider } from './ollama.provider';
import { OpenAIProvider } from './openai.provider';
import { getEnv } from '../config/env';
import { logger } from '../lib/logger';

export type ProviderType = 'ollama' | 'openai';

let cachedProvider: AIProvider | null = null;

/**
 * Factory function to create and return an AI provider instance
 * Supports dynamic switching between local (Ollama) and cloud (OpenAI) providers
 *
 * @param providerType - The type of provider to create ('ollama' or 'openai')
 * @returns An instance implementing the AIProvider interface
 */
export function getAIProvider(providerType: ProviderType = 'openai'): AIProvider {
  if (cachedProvider) {
    return cachedProvider;
  }

  let provider: AIProvider;

  switch (providerType) {
    case 'ollama':
      provider = new OllamaProvider();
      logger.info('Initialized Ollama AI provider (local)');
      break;
    case 'openai':
      provider = new OpenAIProvider();
      logger.info('Initialized OpenAI provider (cloud)');
      break;
    default:
      throw new Error(`Unknown AI provider type: ${providerType}`);
  }

  cachedProvider = provider;
  return provider;
}

/**
 * Reset the cached provider (useful for testing or switching providers)
 */
export function resetAIProvider() {
  cachedProvider = null;
}

/**
 * Get the default provider based on environment or configuration
 * Can be extended to support environment-based provider selection
 */
export function getDefaultProvider(): AIProvider {
  const env = getEnv();
  // Example: you could add an AI_PROVIDER env var to control this
  // For now, default to OpenAI but can be overridden
  return getAIProvider('openai');
}
