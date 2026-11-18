'use strict';

const categoriaModel = require('../models/categoriaModel');

const NOMBRE_MAX = 50; // Categorias.Nombre es nvarchar(50)

// Códigos de SQL Server para violación de índice único (UX_Categorias_Nombre).
const SQL_DUPLICADO = new Set([2627, 2601]);

// GET /api/categorias
async function listar(req, res, next) {
  try {
    const categorias = await categoriaModel.listar();
    return res.status(200).json({ categorias });
  } catch (err) {
    return next(err);
  }
}

// POST /api/categorias (solo administrador)
async function crear(req, res, next) {
  try {
    const nombre = typeof req.body?.Nombre === 'string' ? req.body.Nombre.trim() : '';

    if (!nombre) {
      return res.status(400).json({ error: 'El campo Nombre es obligatorio' });
    }
    if (nombre.length > NOMBRE_MAX) {
      return res.status(400).json({ error: `Nombre no puede superar ${NOMBRE_MAX} caracteres` });
    }
    if (await categoriaModel.buscarPorNombre(nombre)) {
      return res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });
    }

    const categoria = await categoriaModel.crear(nombre);
    return res.status(201).json({ categoria });
  } catch (err) {
    // Dos peticiones simultáneas pueden pasar la comprobación; el índice único lo impide.
    if (SQL_DUPLICADO.has(err.number)) {
      return res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });
    }
    return next(err);
  }
}

module.exports = { listar, crear };
