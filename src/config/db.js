'use strict';

const sql = require('mssql');
require('dotenv').config({ quiet: true });

const REQUIRED_VARS = ['DB_SERVER', 'DB_DATABASE', 'DB_USER', 'DB_PASSWORD'];

const toBool = (value, defaultValue) =>
  value === undefined ? defaultValue : String(value).toLowerCase() === 'true';

function buildConfig() {
  const missing = REQUIRED_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno de la base de datos: ${missing.join(', ')}`);
  }

  return {
    server: process.env.DB_SERVER,
    port: Number.parseInt(process.env.DB_PORT, 10) || 1433,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
      encrypt: toBool(process.env.DB_ENCRYPT, false),
      trustServerCertificate: toBool(process.env.DB_TRUST_SERVER_CERTIFICATE, true),
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };
}

// Un único pool compartido por toda la aplicación.
let poolPromise = null;

/**
 * Devuelve el pool de conexiones, creándolo en la primera llamada.
 * Uso en los modelos (siempre con parámetros):
 *   const pool = await getPool();
 *   const result = await pool.request()
 *     .input('id', sql.Int, id)
 *     .query('SELECT * FROM Usuarios WHERE id = @id');
 */
function getPool() {
  if (!poolPromise) {
    let config;
    try {
      config = buildConfig();
    } catch (err) {
      return Promise.reject(err);
    }

    const pool = new sql.ConnectionPool(config);

    pool.on('error', (err) => {
      console.error('[db] Error en el pool de SQL Server:', err.message);
    });

    poolPromise = pool.connect().catch((err) => {
      // Permite reintentar en la siguiente llamada si la conexión inicial falla.
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

/** Cierra el pool (útil al apagar el servidor o en tests). */
async function closePool() {
  if (!poolPromise) return;
  try {
    const pool = await poolPromise;
    await pool.close();
  } catch (err) {
    console.error('[db] Error al cerrar el pool:', err.message);
  } finally {
    poolPromise = null;
  }
}

module.exports = { sql, getPool, closePool };
