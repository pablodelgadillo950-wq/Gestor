'use strict';

require('dotenv').config({ quiet: true });

const path = require('path');
const express = require('express');
const cors = require('cors');
const { getPool, closePool } = require('./src/config/db');

const app = express();
const PORT = Number.parseInt(process.env.PORT, 10) || 3000;

// --- Middlewares globales ---
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Rutas ---
app.get('/api/health', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ok');
    res.status(200).json({ status: 'ok', database: 'conectada' });
  } catch (err) {
    console.error('[health] Error de base de datos:', err.message);
    res.status(503).json({ status: 'error', database: 'no disponible' });
  }
});

app.use('/api/auth', require('./src/routes/authRoutes'));
app.use('/api/categorias', require('./src/routes/categoriaRoutes'));
app.use('/api/transacciones', require('./src/routes/transaccionRoutes'));

// --- 404 para rutas de la API no encontradas ---
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Recurso no encontrado' });
});

// --- Manejador central de errores ---
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido' });
  }
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({
    error: status >= 500 ? 'Error interno del servidor' : err.message,
  });
});

// --- Arranque y apagado ---
const server = app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

async function shutdown(signal) {
  console.log(`\n${signal} recibido, cerrando servidor...`);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
  // Fuerza la salida si algo queda colgado.
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
