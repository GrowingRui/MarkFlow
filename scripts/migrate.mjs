// Creates the tables in the database at DATABASE_URL. Run once per environment: npm run db:migrate
import { neon } from '@neondatabase/serverless';
import { SCHEMA } from '../server/schema.js';

if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL to the Neon connection string first.');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
for (const statement of SCHEMA.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) await sql.query(statement);
console.log('Tables are ready.');
