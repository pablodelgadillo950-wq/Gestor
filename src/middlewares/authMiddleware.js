'use strict';

const jwt = require('jsonwebtoken');

const ROLES_VALIDOS = ['estudiante', 'administrador'];

/**
 * Valida el JWT del encabezado "Authorization: Bearer <token>".
 * Si es válido, deja el payload ({ Id, Correo, Rol }) en req.usuario.
 */
function verificarToken(req, res, next) {
  const header = req.headers.authorization || '';
  const [esquema, token] = header.split(' ');

  if (esquema !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  if (!process.env.JWT_SECRET) {
    return next(new Error('JWT_SECRET no está definido en las variables de entorno'));
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    req.usuario = { Id: payload.Id, Correo: payload.Correo, Rol: payload.Rol };
    return next();
  } catch (err) {
    const mensaje = err.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido';
    return res.status(401).json({ error: mensaje });
  }
}

/**
 * Restringe una ruta a ciertos roles. Debe usarse después de verificarToken.
 * Ejemplo: router.get('/admin', verificarToken, verificarRol('administrador'), handler)
 */
function verificarRol(...roles) {
  const desconocidos = roles.filter((r) => !ROLES_VALIDOS.includes(r));
  if (roles.length === 0 || desconocidos.length > 0) {
    // Error de programación: falla al arrancar, no en cada petición.
    throw new Error(`verificarRol: roles no válidos (${desconocidos.join(', ') || 'ninguno'})`);
  }

  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    if (!roles.includes(req.usuario.Rol)) {
      return res.status(403).json({ error: 'No tienes permiso para acceder a este recurso' });
    }
    return next();
  };
}

module.exports = { verificarToken, verificarRol, ROLES_VALIDOS };
