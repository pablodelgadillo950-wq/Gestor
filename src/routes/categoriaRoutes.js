'use strict';

const { Router } = require('express');
const { listar, crear } = require('../controllers/categoriaController');
const { verificarToken, verificarRol } = require('../middlewares/authMiddleware');

const router = Router();

router.get('/', verificarToken, listar);
router.post('/', verificarToken, verificarRol('administrador'), crear);

module.exports = router;
