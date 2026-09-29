import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/dal/schema/*.ts',
  out: './drizzle',
  // Only read by the drizzle-kit commands, which run from apps/backend, hence the cwd-relative
  // default. The runtime resolves KR_DB_PATH against the repository root instead.
  dbCredentials: { url: process.env.KR_DB_PATH ?? './data/kr.db' },
});
