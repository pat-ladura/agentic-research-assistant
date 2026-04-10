import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getEnv } from './env';

let connection: ReturnType<typeof postgres> | null = null;

function getConnection() {
  if (!connection) {
    const env = getEnv();
    connection = postgres(env.DATABASE_URL);
  }
  return connection;
}

export function getDb() {
  const connection = getConnection();
  return drizzle(connection);
}

export async function closeDb() {
  if (connection) {
    await connection.end();
    connection = null;
  }
}
