'use strict';

const presupuestoModel = require('../models/presupuestoModel');
const categoriaModel = require('../models/categoriaModel');

const MONTO_REGEX = /^\d{1,8}(\.\d{1,2})?$/; // decimal(10,2): hasta 8 enteros y 2 decimales
const ANIO_MIN = 2020;
const ANIO_MAX = 2100;
const INT_MAX = 2147483647;

// Códigos de SQL Server para violación de índice único (si se crea en la BD).
const SQL_DUPLICADO = new Set([2627, 2601]);
// 547 se usa para FK y CHECK; solo la FK significa categoría inexistente.
const esErrorFK = (err) => err.number === 547 && /FOREIGN KEY/i.test(err.message);

// --- Utilidades de validación ---

/** Entero positivo a partir de un número o texto de solo dígitos; null si no lo es. */
function enteroPositivo(valor) {
  if (typeof valor !== 'number' && typeof valor !== 'string') return null;
  const texto = String(valor).trim();
  if (!/^\d+$/.test(texto)) return null;
  const n = Number(texto);
  return n >= 1 && n <= INT_MAX ? n : null;
}

/** Monto > 0 con hasta 2 decimales; null si no es válido. */
function montoValido(valor) {
  if (typeof valor !== 'number' && typeof valor !== 'string') return null;
  const texto = String(valor).trim();
  const n = Number(texto);
  return MONTO_REGEX.test(texto) && n > 0 ? n : null;
}

const mesValido = (valor) => {
  const n = enteroPositivo(valor);
  return n && n <= 12 ? n : null;
};

const anioValido = (valor) => {
  const n = enteroPositivo(valor);
  return n && n >= ANIO_MIN && n <= ANIO_MAX ? n : null;
};

const MSG_MONTO = 'MontoLimite debe ser un número mayor que 0, con hasta 2 decimales y menor que 100,000,000';
const MSG_MES = 'Mes debe ser un entero entre 1 y 12';
const MSG_ANIO = `Anio debe ser un entero entre ${ANIO_MIN} y ${ANIO_MAX}`;
const MSG_DUPLICADO = 'Ya existe un presupuesto para esa categoría en ese mes y año';

// --- Endpoints ---

// GET /api/presupuestos?mes=&anio=
async function listar(req, res, next) {
  try {
    const filtros = {};
    if (req.query.mes !== undefined) {
      filtros.mes = mesValido(req.query.mes);
      if (!filtros.mes) return res.status(400).json({ error: 'El filtro mes debe estar entre 1 y 12' });
    }
    if (req.query.anio !== undefined) {
      filtros.anio = anioValido(req.query.anio);
      if (!filtros.anio) {
        return res.status(400).json({ error: `El filtro anio debe estar entre ${ANIO_MIN} y ${ANIO_MAX}` });
      }
    }

    const presupuestos = await presupuestoModel.listar(req.usuario.Id, filtros);
    return res.status(200).json({ presupuestos });
  } catch (err) {
    return next(err);
  }
}

// POST /api/presupuestos
async function crear(req, res, next) {
  try {
    const body = req.body || {};

    const CategoriaId = enteroPositivo(body.CategoriaId);
    if (!CategoriaId || !(await categoriaModel.existe(CategoriaId))) {
      return res.status(400).json({ error: 'CategoriaId no corresponde a ninguna categoría' });
    }
    const MontoLimite = montoValido(body.MontoLimite);
    if (!MontoLimite) return res.status(400).json({ error: MSG_MONTO });
    const Mes = mesValido(body.Mes);
    if (!Mes) return res.status(400).json({ error: MSG_MES });
    const Anio = anioValido(body.Anio);
    if (!Anio) return res.status(400).json({ error: MSG_ANIO });

    const datos = { CategoriaId, MontoLimite, Mes, Anio };
    if (await presupuestoModel.existeDuplicado(req.usuario.Id, datos)) {
      return res.status(409).json({ error: MSG_DUPLICADO });
    }

    const presupuesto = await presupuestoModel.crear(req.usuario.Id, datos);
    return res.status(201).json({ presupuesto });
  } catch (err) {
    if (SQL_DUPLICADO.has(err.number)) return res.status(409).json({ error: MSG_DUPLICADO });
    if (esErrorFK(err)) return res.status(400).json({ error: 'CategoriaId no corresponde a ninguna categoría' });
    return next(err);
  }
}

// PUT /api/presupuestos/:id — solo se puede cambiar MontoLimite.
async function actualizar(req, res, next) {
  try {
    const id = enteroPositivo(req.params.id);
    if (!id) return res.status(400).json({ error: 'Id de presupuesto no válido' });

    const MontoLimite = montoValido(req.body?.MontoLimite);
    if (!MontoLimite) return res.status(400).json({ error: MSG_MONTO });

    const presupuesto = await presupuestoModel.actualizarMonto(id, req.usuario.Id, MontoLimite);
    if (!presupuesto) return res.status(404).json({ error: 'Presupuesto no encontrado' });

    return res.status(200).json({ presupuesto });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/presupuestos/:id
async function eliminar(req, res, next) {
  try {
    const id = enteroPositivo(req.params.id);
    if (!id) return res.status(400).json({ error: 'Id de presupuesto no válido' });

    const eliminado = await presupuestoModel.eliminar(id, req.usuario.Id);
    if (!eliminado) return res.status(404).json({ error: 'Presupuesto no encontrado' });

    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
}

module.exports = { listar, crear, actualizar, eliminar };
