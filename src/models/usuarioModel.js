'use strict';

const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../config/db');

const SALT_ROUNDS = Number.parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10;

/**
 * Busca un usuario por correo. Incluye PasswordHash: usar solo para autenticación.
 * @returns {Promise<object|null>}
 */
async function buscarPorCorreo(correo) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('correo', sql.NVarChar, correo)
    .query(
      `SELECT Id, Correo, PasswordHash, Rol, FechaRegistro
         FROM Usuarios
        WHERE Correo = @correo`
    );
  return result.recordset[0] || null;
}

/**
 * Crea un usuario hasheando la contraseña con bcryptjs.
 * @returns {Promise<object>} El usuario creado, sin PasswordHash.
 */
async function crearUsuario({ correo, password, rol = 'estudiante' }) {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const pool = await getPool();
  const result = await pool
    .request()
    .input('correo', sql.NVarChar, correo)
    .input('passwordHash', sql.NVarChar, passwordHash)
    .input('rol', sql.NVarChar, rol)
    .query(
      `INSERT INTO Usuarios (Correo, PasswordHash, Rol, FechaRegistro)
       OUTPUT INSERTED.Id, INSERTED.Correo, INSERTED.Rol, INSERTED.FechaRegistro
       VALUES (@correo, @passwordHash, @rol, GETDATE())`
    );
  return result.recordset[0];
}

/**
 * Obtiene el perfil público de un usuario (sin PasswordHash).
 * @returns {Promise<object|null>}
 */
async function obtenerPerfilPorId(id) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .query(
      `SELECT Id, Correo, Rol, FechaRegistro
         FROM Usuarios
        WHERE Id = @id`
    );
  return result.recordset[0] || null;
}

module.exports = { buscarPorCorreo, crearUsuario, obtenerPerfilPorId };
