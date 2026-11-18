'use strict';

const { sql, getPool } = require('../config/db');

/*
 * Consulta base: cada presupuesto con el nombre de su categoría y lo gastado
 * (egresos del mismo usuario, categoría, mes y año). OUTER APPLY devuelve una
 * fila aunque no haya gastos, y ISNULL convierte esa suma vacía en 0.
 */
const SELECT_PRESUPUESTO = `
  SELECT
    p.Id, p.CategoriaId, c.Nombre AS CategoriaNombre,
    p.MontoLimite, p.Mes, p.Anio,
    g.gastado,
    p.MontoLimite - g.gastado AS disponible,
    CAST(ROUND(g.gastado * 100.0 / p.MontoLimite, 2) AS decimal(12, 2)) AS porcentajeUsado,
    CAST(CASE WHEN g.gastado > p.MontoLimite THEN 1 ELSE 0 END AS bit) AS excedido
  FROM Presupuestos p
  INNER JOIN Categorias c ON c.Id = p.CategoriaId
  OUTER APPLY (
    SELECT ISNULL(SUM(t.Monto), 0) AS gastado
      FROM Transacciones t
     WHERE t.UsuarioId = p.UsuarioId
       AND t.CategoriaId = p.CategoriaId
       AND t.Tipo = 'Egreso'
       AND MONTH(t.Fecha) = p.Mes
       AND YEAR(t.Fecha) = p.Anio
  ) g`;

/**
 * Lista los presupuestos del usuario con filtros opcionales.
 * @param {{ mes?: number, anio?: number }} filtros
 */
async function listar(usuarioId, filtros = {}) {
  const pool = await getPool();
  const request = pool.request().input('usuarioId', sql.Int, usuarioId);
  const condiciones = ['p.UsuarioId = @usuarioId'];

  if (filtros.mes) {
    request.input('mes', sql.Int, filtros.mes);
    condiciones.push('p.Mes = @mes');
  }
  if (filtros.anio) {
    request.input('anio', sql.Int, filtros.anio);
    condiciones.push('p.Anio = @anio');
  }

  const result = await request.query(
    `${SELECT_PRESUPUESTO}
      WHERE ${condiciones.join(' AND ')}
      ORDER BY p.Anio DESC, p.Mes DESC, c.Nombre`
  );
  return result.recordset;
}

/** Obtiene un presupuesto (con sus cálculos) solo si pertenece al usuario. */
async function obtenerPorId(id, usuarioId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .input('usuarioId', sql.Int, usuarioId)
    .query(`${SELECT_PRESUPUESTO} WHERE p.Id = @id AND p.UsuarioId = @usuarioId`);
  return result.recordset[0] || null;
}

/** Indica si el usuario ya tiene un presupuesto para esa categoría, mes y año. */
async function existeDuplicado(usuarioId, { CategoriaId, Mes, Anio }) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('usuarioId', sql.Int, usuarioId)
    .input('categoriaId', sql.Int, CategoriaId)
    .input('mes', sql.Int, Mes)
    .input('anio', sql.Int, Anio)
    .query(
      `SELECT 1 AS existe FROM Presupuestos
        WHERE UsuarioId = @usuarioId AND CategoriaId = @categoriaId
          AND Mes = @mes AND Anio = @anio`
    );
  return result.recordset.length > 0;
}

/** Crea un presupuesto y lo devuelve con sus cálculos. */
async function crear(usuarioId, { CategoriaId, MontoLimite, Mes, Anio }) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('usuarioId', sql.Int, usuarioId)
    .input('categoriaId', sql.Int, CategoriaId)
    .input('montoLimite', sql.Decimal(10, 2), MontoLimite)
    .input('mes', sql.Int, Mes)
    .input('anio', sql.Int, Anio)
    .query(
      `INSERT INTO Presupuestos (UsuarioId, CategoriaId, MontoLimite, Mes, Anio)
       OUTPUT INSERTED.Id
       VALUES (@usuarioId, @categoriaId, @montoLimite, @mes, @anio)`
    );
  return obtenerPorId(result.recordset[0].Id, usuarioId);
}

/**
 * Actualiza el MontoLimite solo si el presupuesto pertenece al usuario.
 * @returns {Promise<object|null>} El presupuesto actualizado, o null si no existe o no es suyo.
 */
async function actualizarMonto(id, usuarioId, montoLimite) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .input('usuarioId', sql.Int, usuarioId)
    .input('montoLimite', sql.Decimal(10, 2), montoLimite)
    .query(
      `UPDATE Presupuestos SET MontoLimite = @montoLimite
        WHERE Id = @id AND UsuarioId = @usuarioId`
    );
  if (result.rowsAffected[0] === 0) return null;
  return obtenerPorId(id, usuarioId);
}

/**
 * Elimina un presupuesto solo si pertenece al usuario.
 * @returns {Promise<boolean>} true si se eliminó.
 */
async function eliminar(id, usuarioId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .input('usuarioId', sql.Int, usuarioId)
    .query('DELETE FROM Presupuestos WHERE Id = @id AND UsuarioId = @usuarioId');
  return result.rowsAffected[0] > 0;
}

module.exports = { listar, obtenerPorId, existeDuplicado, crear, actualizarMonto, eliminar };
