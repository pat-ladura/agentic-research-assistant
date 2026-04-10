import { defineConfig } from 'drizzle-kit';
import { getEnv } from './src/config/env';

const env = getEnv();

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: env.DRIZZLE_DATABASE_URL, // Use DRIZZLE_DATABASE_URL for Drizzle's connection, separate from DATABASE_URL used by the app
  },
  verbose: true,
  strict: true,
});
