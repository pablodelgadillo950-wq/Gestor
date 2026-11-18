'use strict';

const transaccionModel = require('../models/transaccionModel');
const categoriaModel = require('../models/categoriaModel');

const TIPOS = ['Ingreso', 'Egreso'];
const DESCRIPCION_MAX = 200; // Transacciones.Descripcion es nvarchar(200)
const MONTO_REGEX = /^\d{1,8}(\.\d{1,2})?$/; // decimal(10,2): hasta 8 enteros y 2 decimales
const FECHA_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const INT_MAX = 2147483647;
const CAMPOS = ['Tipo', 'Monto', 'Fecha', 'CategoriaId', 'Descripcion'];

// SQL Server usa el código 547 tanto para claves foráneas como para CHECK;
// se distingue por el mensaje.
const esErrorFK = (err) => err.number === 547 && /FOREIGN KEY/i.test(err.message);

class ErrorValidacion extends Error {}

// --- Utilidades de validación ---

function enteroPositivo(valor) {
  const texto = String(valor ?? '');
  if (!/^\d+$/.test(texto)) return null;
  const n = Number(texto);
  return n >= 1 && n <= INT_MAX ? n : null;
}

/** 'ingreso' -> 'Ingreso'. Devuelve null si no es un tipo válido. */
function normalizarTipo(valor) {
  if (typeof valor !== 'string') return null;
  const v = valor.trim().toLowerCase();
  return TIPOS.find((t) => t.toLowerCase() === v) || null;
}

function esFechaValida(texto) {
  const m = FECHA_REGEX.exec(texto);
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return anio >= 1753 && d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/**
 * Valida y normaliza los datos de una transacción. Lanza ErrorValidacion con el
 * primer problema encontrado.
 */
async function validarDatos(datos) {
  const Tipo = normalizarTipo(datos.Tipo);
  if (!Tipo) throw new ErrorValidacion("Tipo debe ser 'Ingreso' o 'Egreso'");

  const montoTexto = typeof datos.Monto === 'number' || typeof datos.Monto === 'string'
    ? String(datos.Monto).trim()
    : '';
  const Monto = Number(montoTexto);
  if (!MONTO_REGEX.test(montoTexto) || !(Monto > 0)) {
    throw new ErrorValidacion('Monto debe ser un número mayor que 0, con hasta 2 decimales y menor que 100,000,000');
  }

  const Fecha = typeof datos.Fecha === 'string' ? datos.Fecha.trim() : '';
  if (!esFechaValida(Fecha)) {
    throw new ErrorValidacion('Fecha debe ser una fecha válida con formato YYYY-MM-DD');
  }

  let CategoriaId = null;
  if (datos.CategoriaId !== undefined && datos.CategoriaId !== null && datos.CategoriaId !== '') {
    CategoriaId = enteroPositivo(datos.CategoriaId);
    if (!CategoriaId || !(await categoriaModel.existe(CategoriaId))) {
      throw new ErrorValidacion('CategoriaId no corresponde a ninguna categoría');
    }
  }

  let Descripcion = null;
  if (datos.Descripcion !== undefined && datos.Descripcion !== null) {
    if (typeof datos.Descripcion !== 'string') throw new ErrorValidacion('Descripcion debe ser texto');
    Descripcion = datos.Descripcion.trim() || null;
    if (Descripcion && Descripcion.length > DESCRIPCION_MAX) {
      throw new ErrorValidacion(`Descripcion no puede superar ${DESCRIPCION_MAX} caracteres`);
    }
  }

  return { Tipo, Monto, Fecha, CategoriaId, Descripcion };
}

/** Respuesta común para errores de validación y de clave foránea. */
function manejarError(err, res, next) {
  if (err instanceof ErrorValidacion) return res.status(400).json({ error: err.message });
  if (esErrorFK(err)) return res.status(400).json({ error: 'CategoriaId no corresponde a ninguna categoría' });
  return next(err);
}

// --- Endpoints ---

// GET /api/transacciones?tipo=&mes=&anio=&categoriaId=
async function listar(req, res, next) {
  try {
    const { tipo, mes, anio, categoriaId } = req.query;
    const filtros = {};

    if (tipo !== undefined) {
      filtros.tipo = normalizarTipo(tipo);
      if (!filtros.tipo) return res.status(400).json({ error: "El filtro tipo debe ser 'Ingreso' o 'Egreso'" });
    }
    if (mes !== undefined) {
      filtros.mes = enteroPositivo(mes);
      if (!filtros.mes || filtros.mes > 12) return res.status(400).json({ error: 'El filtro mes debe estar entre 1 y 12' });
    }
    if (anio !== undefined) {
      filtros.anio = enteroPositivo(anio);
      if (!filtros.anio || filtros.anio < 1753 || filtros.anio > 9999) {
        return res.status(400).json({ error: 'El filtro anio no es válido' });
      }
    }
    if (categoriaId !== undefined) {
      filtros.categoriaId = enteroPositivo(categoriaId);
      if (!filtros.categoriaId) return res.status(400).json({ error: 'El filtro categoriaId no es válido' });
    }

    const { transacciones, resumen } = await transaccionModel.listar(req.usuario.Id, filtros);
    return res.status(200).json({ transacciones, resumen });
  } catch (err) {
    return next(err);
  }
}

// POST /api/transacciones
async function crear(req, res, next) {
  try {
    const datos = await validarDatos(req.body || {});
    const transaccion = await transaccionModel.crear(req.usuario.Id, datos);
    return res.status(201).json({ transaccion });
  } catch (err) {
    return manejarError(err, res, next);
  }
}

// PUT /api/transacciones/:id — actualización parcial: los campos omitidos se conservan.
async function actualizar(req, res, next) {
  try {
    const id = enteroPositivo(req.params.id);
    if (!id) return res.status(400).json({ error: 'Id de transacción no válido' });

    const body = req.body || {};
    if (!CAMPOS.some((campo) => campo in body)) {
      return res.status(400).json({ error: `Envía al menos uno de: ${CAMPOS.join(', ')}` });
    }

    const actual = await transaccionModel.obtenerPorId(id, req.usuario.Id);
    if (!actual) return res.status(404).json({ error: 'Transacción no encontrada' });

    const combinados = {};
    for (const campo of CAMPOS) combinados[campo] = campo in body ? body[campo] : actual[campo];

    const datos = await validarDatos(combinados);
    const transaccion = await transaccionModel.actualizar(id, req.usuario.Id, datos);
    if (!transaccion) return res.status(404).json({ error: 'Transacción no encontrada' });

    return res.status(200).json({ transaccion });
  } catch (err) {
    return manejarError(err, res, next);
  }
}

// DELETE /api/transacciones/:id
async function eliminar(req, res, next) {
  try {
    const id = enteroPositivo(req.params.id);
    if (!id) return res.status(400).json({ error: 'Id de transacción no válido' });

    const eliminada = await transaccionModel.eliminar(id, req.usuario.Id);
    if (!eliminada) return res.status(404).json({ error: 'Transacción no encontrada' });

    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
}

module.exports = { listar, crear, actualizar, eliminar };
