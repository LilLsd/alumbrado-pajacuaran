const { Pool } = require('pg');
require('dotenv').config();

// Detecta si la conexión apunta a tu máquina local
const isLocal = process.env.DB_HOST === 'localhost' || process.env.DB_HOST === '127.0.0.1' || !process.env.DB_HOST;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: String(process.env.DB_USER || 'postgres'),
  password: String(process.env.DB_PASSWORD || ''),
  database: process.env.DB_NAME || process.env.DB_DATABASE || 'alumbrado_pajacuaran',
  port: Number(process.env.DB_PORT) || 5432,
  // Desactiva SSL si es local; lo activa si usas Supabase/Render
  ssl: isLocal ? false : { rejectUnauthorized: false }
});

module.exports = pool;