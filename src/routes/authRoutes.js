'use strict';

const { Router } = require('express');
const { register, login, perfil } = require('../controllers/authController');
const { verificarToken } = require('../middlewares/authMiddleware');

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/perfil', verificarToken, perfil);

module.exports = router;
