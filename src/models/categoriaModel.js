'use strict';

const { sql, getPool } = require('../config/db');

/** Lista todas las categorías ordenadas por Id. */
async function listar() {
  const pool = await getPool();
  const result = await pool.request().query('SELECT Id, Nombre FROM Categorias ORDER BY Id');
  return result.recordset;
}

/**
 * Busca una categoría por nombre. La intercalación de la BD (Modern_Spanish_CI_AS)
 * hace que la comparación no distinga mayúsculas/minúsculas.
 */
async function buscarPorNombre(nombre) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('nombre', sql.NVarChar(50), nombre)
    .query('SELECT Id, Nombre FROM Categorias WHERE Nombre = @nombre');
  return result.recordset[0] || null;
}

/** Indica si existe una categoría con ese Id. */
async function existe(id) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .query('SELECT 1 AS existe FROM Categorias WHERE Id = @id');
  return result.recordset.length > 0;
}

/** Crea una categoría y la devuelve. */
async function crear(nombre) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('nombre', sql.NVarChar(50), nombre)
    .query('INSERT INTO Categorias (Nombre) OUTPUT INSERTED.Id, INSERTED.Nombre VALUES (@nombre)');
  return result.recordset[0];
}

module.exports = { listar, buscarPorNombre, existe, crear };
