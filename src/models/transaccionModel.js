'use strict';

const { sql, getPool } = require('../config/db');

// Columnas devueltas al cliente. Fecha se formatea como 'YYYY-MM-DD' (estilo 23)
// para evitar desfases de zona horaria al convertirla a Date en JavaScript.
const COLUMNAS = `
  t.Id, t.Tipo, t.Monto, CONVERT(char(10), t.Fecha, 23) AS Fecha,
  t.CategoriaId, c.Nombre AS CategoriaNombre, t.Descripcion`;

/** Añade los parámetros comunes de una transacción a la petición. */
function agregarDatos(request, { Tipo, Monto, Fecha, CategoriaId, Descripcion }) {
  return request
    .input('tipo', sql.NVarChar(10), Tipo)
    .input('monto', sql.Decimal(10, 2), Monto)
    .input('fecha', sql.VarChar(10), Fecha)
    .input('categoriaId', sql.Int, CategoriaId)
    .input('descripcion', sql.NVarChar(200), Descripcion);
}

/** Obtiene una transacción solo si pertenece al usuario. */
async function obtenerPorId(id, usuarioId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .input('usuarioId', sql.Int, usuarioId)
    .query(
      `SELECT ${COLUMNAS}
         FROM Transacciones t
         LEFT JOIN Categorias c ON c.Id = t.CategoriaId
        WHERE t.Id = @id AND t.UsuarioId = @usuarioId`
    );
  return result.recordset[0] || null;
}

/**
 * Lista las transacciones del usuario con filtros opcionales y calcula el resumen
 * con los mismos filtros. Solo se concatenan fragmentos SQL fijos; todos los
 * valores van como parámetros.
 * @param {{ tipo?: string, mes?: number, anio?: number, categoriaId?: number }} filtros
 */
async function listar(usuarioId, filtros = {}) {
  const pool = await getPool();
  const request = pool.request().input('usuarioId', sql.Int, usuarioId);
  const condiciones = ['t.UsuarioId = @usuarioId'];

  if (filtros.tipo) {
    request.input('tipo', sql.NVarChar(10), filtros.tipo);
    condiciones.push('t.Tipo = @tipo');
  }
  if (filtros.mes) {
    request.input('mes', sql.Int, filtros.mes);
    condiciones.push('MONTH(t.Fecha) = @mes');
  }
  if (filtros.anio) {
    request.input('anio', sql.Int, filtros.anio);
    condiciones.push('YEAR(t.Fecha) = @anio');
  }
  if (filtros.categoriaId) {
    request.input('categoriaId', sql.Int, filtros.categoriaId);
    condiciones.push('t.CategoriaId = @categoriaId');
  }

  const where = condiciones.join(' AND ');
  const result = await request.query(
    `SELECT ${COLUMNAS}
       FROM Transacciones t
       LEFT JOIN Categorias c ON c.Id = t.CategoriaId
      WHERE ${where}
      ORDER BY t.Fecha DESC, t.Id DESC;

     SELECT
       ISNULL(SUM(CASE WHEN t.Tipo = 'Ingreso' THEN t.Monto END), 0) AS totalIngresos,
       ISNULL(SUM(CASE WHEN t.Tipo = 'Egreso'  THEN t.Monto END), 0) AS totalEgresos
       FROM Transacciones t
      WHERE ${where};`
  );

  const { totalIngresos, totalEgresos } = result.recordsets[1][0];
  return {
    transacciones: result.recordsets[0],
    resumen: {
      totalIngresos,
      totalEgresos,
      // Se redondea a 2 decimales para evitar residuos de coma flotante.
      saldo: Math.round((totalIngresos - totalEgresos) * 100) / 100,
    },
  };
}

/** Crea una transacción para el usuario y la devuelve con el nombre de su categoría. */
async function crear(usuarioId, datos) {
  const pool = await getPool();
  const request = agregarDatos(pool.request().input('usuarioId', sql.Int, usuarioId), datos);
  const result = await request.query(
    `DECLARE @nueva TABLE (Id int);
     INSERT INTO Transacciones (UsuarioId, Tipo, Monto, Fecha, CategoriaId, Descripcion)
     OUTPUT INSERTED.Id INTO @nueva
     VALUES (@usuarioId, @tipo, @monto, CONVERT(date, @fecha, 23), @categoriaId, @descripcion);

     SELECT ${COLUMNAS}
       FROM Transacciones t
       LEFT JOIN Categorias c ON c.Id = t.CategoriaId
      WHERE t.Id = (SELECT Id FROM @nueva);`
  );
  return result.recordset[0];
}

/**
 * Actualiza una transacción solo si pertenece al usuario.
 * @returns {Promise<object|null>} La transacción actualizada, o null si no existe o no es suya.
 */
async function actualizar(id, usuarioId, datos) {
  const pool = await getPool();
  const request = agregarDatos(
    pool.request().input('id', sql.Int, id).input('usuarioId', sql.Int, usuarioId),
    datos
  );
  const result = await request.query(
    `UPDATE Transacciones
        SET Tipo = @tipo, Monto = @monto, Fecha = CONVERT(date, @fecha, 23),
            CategoriaId = @categoriaId, Descripcion = @descripcion
      WHERE Id = @id AND UsuarioId = @usuarioId;

     SELECT ${COLUMNAS}
       FROM Transacciones t
       LEFT JOIN Categorias c ON c.Id = t.CategoriaId
      WHERE t.Id = @id AND t.UsuarioId = @usuarioId;`
  );
  return result.recordset[0] || null;
}

/**
 * Elimina una transacción solo si pertenece al usuario.
 * @returns {Promise<boolean>} true si se eliminó.
 */
async function eliminar(id, usuarioId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .input('usuarioId', sql.Int, usuarioId)
    .query('DELETE FROM Transacciones WHERE Id = @id AND UsuarioId = @usuarioId');
  return result.rowsAffected[0] > 0;
}

module.exports = { obtenerPorId, listar, crear, actualizar, eliminar };
