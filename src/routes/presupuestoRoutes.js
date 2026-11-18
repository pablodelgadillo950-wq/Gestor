'use strict';

const { Router } = require('express');
const { listar, crear, actualizar, eliminar } = require('../controllers/presupuestoController');
const { verificarToken } = require('../middlewares/authMiddleware');

const router = Router();

// Todas las rutas requieren sesión; el controlador filtra siempre por req.usuario.Id.
router.use(verificarToken);

router.get('/', listar);
router.post('/', crear);
router.put('/:id', actualizar);
router.delete('/:id', eliminar);

module.exports = router;
