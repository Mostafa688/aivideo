import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});

await pool.query("UPDATE users SET model3_access = 1 WHERE email = 'digidelight33@gmail.com'");
console.log('✅ Done! Model 3 activated for digidelight33@gmail.com');
process.exit(0);
