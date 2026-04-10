import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3005),
  DATABASE_URL: z.url('Invalid DATABASE_URL'),
  DRIZZLE_DATABASE_URL: z.url('Invalid DRIZZLE_DATABASE_URL'),
  API_KEY: z.string().min(1, 'API_KEY is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  OLLAMA_BASE_URL: z.url('Invalid OLLAMA_BASE_URL').default('http://localhost:11434'),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
});

type Env = z.infer<typeof EnvSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  const env = EnvSchema.parse(process.env);
  cachedEnv = env;
  return env;
}
