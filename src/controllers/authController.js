'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const usuarioModel = require('../models/usuarioModel');

const CORREO_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72; // bcrypt ignora lo que pase de 72 bytes

// Hash válido usado cuando el correo no existe, para que el login tarde lo mismo
// exista o no el usuario (evita enumerar correos por tiempo de respuesta).
const HASH_FICTICIO = bcrypt.hashSync('contraseña-ficticia', 10);

// Códigos de SQL Server para violación de clave única / índice único.
const SQL_DUPLICADO = new Set([2627, 2601]);

function generarToken(usuario) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET no está definido en las variables de entorno');
  }
  return jwt.sign(
    { Id: usuario.Id, Correo: usuario.Correo, Rol: usuario.Rol },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

function leerCredenciales(body) {
  const correo = typeof body?.correo === 'string' ? body.correo.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  return { correo, password };
}

// POST /api/auth/register
async function register(req, res, next) {
  try {
    const { correo, password } = leerCredenciales(req.body);

    if (!CORREO_REGEX.test(correo)) {
      return res.status(400).json({ error: 'Correo no válido' });
    }
    if (password.length < PASSWORD_MIN || Buffer.byteLength(password) > PASSWORD_MAX) {
      return res.status(400).json({
        error: `La contraseña debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres`,
      });
    }

    if (await usuarioModel.buscarPorCorreo(correo)) {
      return res.status(409).json({ error: 'El correo ya está registrado' });
    }

    // El rol nunca se toma del cliente: todo registro público es 'estudiante'.
    const usuario = await usuarioModel.crearUsuario({ correo, password, rol: 'estudiante' });
    const token = generarToken(usuario);

    return res.status(201).json({ token, usuario });
  } catch (err) {
    if (SQL_DUPLICADO.has(err.number)) {
      return res.status(409).json({ error: 'El correo ya está registrado' });
    }
    return next(err);
  }
}

// POST /api/auth/login
async function login(req, res, next) {
  try {
    const { correo, password } = leerCredenciales(req.body);

    if (!correo || !password) {
      return res.status(400).json({ error: 'Correo y contraseña son obligatorios' });
    }

    const usuario = await usuarioModel.buscarPorCorreo(correo);
    const coincide = await bcrypt.compare(password, usuario ? usuario.PasswordHash : HASH_FICTICIO);

    if (!usuario || !coincide) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = generarToken(usuario);
    const { PasswordHash, ...perfil } = usuario;

    return res.status(200).json({ token, usuario: perfil });
  } catch (err) {
    return next(err);
  }
}

// GET /api/auth/perfil (requiere verificarToken)
async function perfil(req, res, next) {
  try {
    const usuario = await usuarioModel.obtenerPerfilPorId(req.usuario.Id);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    return res.status(200).json({ usuario });
  } catch (err) {
    return next(err);
  }
}

module.exports = { register, login, perfil };
