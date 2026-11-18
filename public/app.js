'use strict';

/* =========================================================
   Gestor — frontend (JavaScript puro + fetch)
   Consume las rutas documentadas en docs/API_Y_PROCEDIMIENTOS.md.
   Seguridad: todo dato que viene del servidor se inserta con
   textContent (nunca innerHTML) para evitar XSS.
   ========================================================= */

const API = '/api';
const TOKEN_KEY = 'gestor_token';
const LOCALE = 'es-MX';

const formatoMoneda = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatoMes = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric', timeZone: 'UTC' });
const formatoFecha = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

const estado = {
  token: null,
  usuario: null,
  categorias: [],
  transacciones: new Map(), // Id -> transacción (para editar)
  editandoId: null,
};

const $ = (selector) => document.querySelector(selector);

/* ---------------------------------------------------------
   Utilidades
   --------------------------------------------------------- */

/** Crea un elemento. Los hijos de tipo string se insertan como texto. */
function el(tag, props = {}, ...hijos) {
  const nodo = document.createElement(tag);
  for (const [clave, valor] of Object.entries(props)) {
    if (valor === undefined || valor === null || valor === false) continue;
    if (clave === 'class') nodo.className = valor;
    else if (clave === 'dataset') Object.assign(nodo.dataset, valor);
    else if (clave === 'text') nodo.textContent = valor;
    else nodo.setAttribute(clave, valor === true ? '' : valor);
  }
  for (const hijo of hijos.flat()) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return nodo;
}

/** Icono SVG estático (sin datos del usuario). */
function icono(nombre) {
  const rutas = {
    editar: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    eliminar: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
  };
  const span = document.createElement('span');
  span.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${rutas[nombre]}</svg>`;
  return span.firstElementChild;
}

const dinero = (n) => `$${formatoMoneda.format(Number(n) || 0)}`;

/** 'YYYY-MM-DD' -> '03 nov 2026' sin desfases de zona horaria. */
function fechaLegible(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return formatoFecha.format(new Date(Date.UTC(a, m - 1, d)));
}

/** 'YYYY-MM' -> 'noviembre de 2026'. */
function mesLegible(valor) {
  const [a, m] = valor.split('-').map(Number);
  return formatoMes.format(new Date(Date.UTC(a, m - 1, 1)));
}

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const mesActual = () => hoyISO().slice(0, 7);

function toast(mensaje, tipo = 'ok') {
  const nodo = el('div', { class: `toast${tipo === 'error' ? ' toast--error' : ''}`, role: tipo === 'error' ? 'alert' : 'status' }, mensaje);
  $('#toasts').append(nodo);
  setTimeout(() => nodo.remove(), tipo === 'error' ? 6000 : 3500);
}

function mostrarErrorForm(form, mensaje) {
  const caja = form.querySelector('.form__error');
  caja.textContent = mensaje || '';
  caja.hidden = !mensaje;
}

/** Deshabilita el botón de envío mientras dura la petición. */
async function conEnvio(form, accion) {
  const boton = form.querySelector('[type="submit"]');
  boton.disabled = true;
  mostrarErrorForm(form, '');
  try {
    await accion();
  } catch (err) {
    if (!(err instanceof SesionExpirada)) mostrarErrorForm(form, err.message);
  } finally {
    boton.disabled = false;
  }
}

/* ---------------------------------------------------------
   Cliente de la API
   --------------------------------------------------------- */

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
class SesionExpirada extends Error {}

async function api(ruta, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (estado.token) headers.Authorization = `Bearer ${estado.token}`;

  let respuesta;
  try {
    respuesta = await fetch(API + ruta, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor. Revisa tu conexión.');
  }

  const texto = await respuesta.text();
  let datos = null;
  if (texto) {
    try { datos = JSON.parse(texto); } catch { datos = null; }
  }

  if (!respuesta.ok) {
    // Token caducado o inválido en una ruta protegida: se cierra la sesión.
    if (respuesta.status === 401 && estado.token) {
      cerrarSesion(datos?.error === 'Token expirado'
        ? 'Tu sesión expiró. Vuelve a iniciar sesión.'
        : 'Tu sesión ya no es válida. Vuelve a iniciar sesión.');
      throw new SesionExpirada();
    }
    throw new ApiError(respuesta.status, datos?.error || `Error ${respuesta.status}`);
  }
  return datos;
}

/** Ejecuta una carga y muestra el error como notificación. */
async function intentar(accion) {
  try {
    await accion();
  } catch (err) {
    if (!(err instanceof SesionExpirada)) toast(err.message, 'error');
  }
}

/* ---------------------------------------------------------
   Sesión y autenticación
   --------------------------------------------------------- */

function leerToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function guardarToken(token) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* almacenamiento no disponible */ }
}
function borrarToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* almacenamiento no disponible */ }
}

function mostrarAuth(aviso) {
  $('#topbar').hidden = true;
  $('#vista-dashboard').hidden = true;
  $('#vista-auth').hidden = false;
  const caja = $('#auth-aviso');
  caja.textContent = aviso || '';
  caja.hidden = !aviso;
}

function cambiarPestana(cual) {
  const esLogin = cual === 'login';
  for (const [tab, form, activo] of [['#tab-login', '#form-login', esLogin], ['#tab-registro', '#form-registro', !esLogin]]) {
    const t = $(tab);
    t.classList.toggle('is-active', activo);
    t.setAttribute('aria-selected', String(activo));
    t.tabIndex = activo ? 0 : -1;
    $(form).hidden = !activo;
    mostrarErrorForm($(form), '');
  }
  $(esLogin ? '#form-login' : '#form-registro').querySelector('input').focus();
}

async function entrar(token) {
  estado.token = token;
  guardarToken(token);
  await cargarPerfil();
}

async function cargarPerfil() {
  const { usuario } = await api('/auth/perfil');
  estado.usuario = usuario;
  mostrarDashboard();
}

function cerrarSesion(aviso) {
  estado.token = null;
  estado.usuario = null;
  estado.transacciones.clear();
  borrarToken();
  salirEdicion();
  for (const form of document.querySelectorAll('#vista-dashboard form')) {
    form.reset();
    if (form.querySelector('.form__error')) mostrarErrorForm(form, '');
  }
  for (const form of ['#form-login', '#form-registro']) $(form).reset();
  cambiarPestana('login');
  mostrarAuth(aviso);
}

async function enviarAuth(evento, ruta) {
  evento.preventDefault();
  const form = evento.currentTarget;
  const correo = form.correo.value.trim();
  const password = form.password.value;

  if (!correo || !password) return mostrarErrorForm(form, 'Escribe tu correo y tu contraseña.');
  if (ruta === '/auth/register' && password.length < 8) {
    return mostrarErrorForm(form, 'La contraseña debe tener al menos 8 caracteres.');
  }

  await conEnvio(form, async () => {
    const { token } = await api(ruta, { method: 'POST', body: { correo, password } });
    await entrar(token);
    form.reset();
    if (ruta === '/auth/register') toast('¡Cuenta creada! Bienvenido a Gestor.');
  });
}

/* ---------------------------------------------------------
   Dashboard
   --------------------------------------------------------- */

function mostrarDashboard() {
  const { Correo, Rol } = estado.usuario;
  $('#usuario-correo').textContent = Correo;
  const badge = $('#usuario-rol');
  badge.textContent = Rol;
  badge.classList.toggle('badge--admin', Rol === 'administrador');

  $('#panel-admin').hidden = Rol !== 'administrador';
  $('#vista-auth').hidden = true;
  $('#topbar').hidden = false;
  $('#vista-dashboard').hidden = false;

  // Valores iniciales de los formularios
  $('#form-transaccion').Fecha.value = hoyISO();
  $('#filtro-presupuestos').value = mesActual();
  $('#form-presupuesto').periodo.value = mesActual();

  intentar(async () => {
    await cargarCategorias();
    await Promise.all([cargarTransacciones(), cargarPresupuestos()]);
  });
}

/* ----- Categorías ----- */

async function cargarCategorias() {
  const { categorias } = await api('/categorias');
  estado.categorias = categorias;
  pintarSelectsCategorias();
  pintarListaCategorias();
}

function pintarSelectsCategorias() {
  for (const select of document.querySelectorAll('select[data-categorias]')) {
    const actual = select.value;
    const opcional = select.dataset.categorias === 'opcional';
    select.replaceChildren(
      el('option', { value: '' }, opcional ? 'Sin categoría' : 'Selecciona una categoría'),
      ...estado.categorias.map((c) => el('option', { value: c.Id }, c.Nombre))
    );
    if ([...select.options].some((o) => o.value === actual)) select.value = actual;
  }
}

function pintarListaCategorias() {
  const lista = $('#lista-categorias');
  lista.replaceChildren(...estado.categorias.map((c) => el('li', {}, el('span', {}, `#${c.Id}`), c.Nombre)));
  $('#categorias-total').textContent = `${estado.categorias.length} en total`;
}

/* ----- Transacciones ----- */

function filtrosActuales() {
  const form = $('#form-filtros');
  return { tipo: form.tipo.value, mes: form.mes.value };
}

async function cargarTransacciones() {
  const { tipo, mes } = filtrosActuales();
  const params = new URLSearchParams();
  if (tipo) params.set('tipo', tipo);
  if (mes) {
    const [anio, m] = mes.split('-');
    params.set('anio', anio);
    params.set('mes', String(Number(m)));
  }
  const query = params.toString();
  const { transacciones, resumen } = await api(`/transacciones${query ? `?${query}` : ''}`);

  estado.transacciones = new Map(transacciones.map((t) => [t.Id, t]));
  pintarResumen(resumen, { tipo, mes });
  pintarTransacciones(transacciones);
}

function pintarResumen({ totalIngresos, totalEgresos, saldo }, { tipo, mes }) {
  $('#total-ingresos').textContent = dinero(totalIngresos);
  $('#total-egresos').textContent = dinero(totalEgresos);
  const nodoSaldo = $('#saldo');
  nodoSaldo.textContent = saldo < 0 ? `−${dinero(Math.abs(saldo))}` : dinero(saldo);
  nodoSaldo.classList.toggle('is-negativo', saldo < 0);

  const partes = [mes ? mesLegible(mes) : 'Todos los movimientos'];
  if (tipo) partes.push(tipo === 'Ingreso' ? 'solo ingresos' : 'solo egresos');
  $('#resumen-periodo').textContent = partes.join(' · ');
}

function pintarTransacciones(transacciones) {
  const filas = transacciones.map((t) => {
    const esIngreso = t.Tipo === 'Ingreso';
    return el('tr', { dataset: { id: t.Id }, class: estado.editandoId === t.Id ? 'is-editando' : null },
      el('td', {}, fechaLegible(t.Fecha)),
      el('td', { class: `desc${t.Descripcion ? '' : ' sin-dato'}` }, t.Descripcion || '—'),
      el('td', { class: t.CategoriaNombre ? null : 'sin-dato' }, t.CategoriaNombre || 'Sin categoría'),
      el('td', { class: `num ${esIngreso ? 'monto--ingreso' : 'monto--egreso'}` }, `${esIngreso ? '+' : '−'}${dinero(t.Monto)}`),
      el('td', { class: 'acciones' },
        el('button', { type: 'button', class: 'icon-btn', dataset: { accion: 'editar', id: t.Id }, 'aria-label': `Editar movimiento del ${fechaLegible(t.Fecha)}`, title: 'Editar' }, icono('editar')),
        el('button', { type: 'button', class: 'icon-btn icon-btn--peligro', dataset: { accion: 'eliminar', id: t.Id }, 'aria-label': `Eliminar movimiento del ${fechaLegible(t.Fecha)}`, title: 'Eliminar' }, icono('eliminar'))
      )
    );
  });
  $('#tabla-transacciones').replaceChildren(...filas);
  $('#transacciones-vacio').hidden = transacciones.length > 0;
  $('.table-wrap').hidden = transacciones.length === 0;
}

function entrarEdicion(id) {
  const t = estado.transacciones.get(id);
  if (!t) return;
  const form = $('#form-transaccion');
  estado.editandoId = id;

  form.querySelector(`input[name="Tipo"][value="${t.Tipo}"]`).checked = true;
  form.Monto.value = Number(t.Monto).toFixed(2);
  form.Fecha.value = t.Fecha;
  form.CategoriaId.value = t.CategoriaId ?? '';
  form.Descripcion.value = t.Descripcion ?? '';
  mostrarErrorForm(form, '');

  $('#titulo-form-transaccion').textContent = 'Editar movimiento';
  $('#btn-guardar-transaccion').textContent = 'Guardar cambios';
  $('#btn-cancelar-edicion').hidden = false;
  for (const fila of document.querySelectorAll('#tabla-transacciones tr')) {
    fila.classList.toggle('is-editando', Number(fila.dataset.id) === id);
  }
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  form.Monto.focus({ preventScroll: true });
}

function salirEdicion() {
  estado.editandoId = null;
  const form = $('#form-transaccion');
  form.reset();
  form.Fecha.value = hoyISO();
  mostrarErrorForm(form, '');
  $('#titulo-form-transaccion').textContent = 'Nuevo movimiento';
  $('#btn-guardar-transaccion').textContent = 'Registrar';
  $('#btn-cancelar-edicion').hidden = true;
  for (const fila of document.querySelectorAll('#tabla-transacciones tr.is-editando')) fila.classList.remove('is-editando');
}

async function guardarTransaccion(evento) {
  evento.preventDefault();
  const form = evento.currentTarget;
  const monto = form.Monto.value.trim();

  if (!monto || Number(monto) <= 0) return mostrarErrorForm(form, 'Escribe un monto mayor que 0.');
  if (!form.Fecha.value) return mostrarErrorForm(form, 'Selecciona una fecha.');

  const datos = {
    Tipo: form.querySelector('input[name="Tipo"]:checked').value,
    Monto: monto,
    Fecha: form.Fecha.value,
    CategoriaId: form.CategoriaId.value ? Number(form.CategoriaId.value) : null,
    Descripcion: form.Descripcion.value.trim() || null,
  };

  await conEnvio(form, async () => {
    if (estado.editandoId) {
      await api(`/transacciones/${estado.editandoId}`, { method: 'PUT', body: datos });
      toast('Movimiento actualizado.');
    } else {
      await api('/transacciones', { method: 'POST', body: datos });
      toast(`${datos.Tipo} registrado.`);
    }
    salirEdicion();
    await Promise.all([cargarTransacciones(), cargarPresupuestos()]);
  });
}

async function eliminarTransaccion(id) {
  const t = estado.transacciones.get(id);
  if (!t) return;
  const detalle = `${t.Tipo} de ${dinero(t.Monto)} del ${fechaLegible(t.Fecha)}`;
  if (!confirm(`¿Eliminar el movimiento "${detalle}"? Esta acción no se puede deshacer.`)) return;

  await intentar(async () => {
    await api(`/transacciones/${id}`, { method: 'DELETE' });
    if (estado.editandoId === id) salirEdicion();
    toast('Movimiento eliminado.');
    await Promise.all([cargarTransacciones(), cargarPresupuestos()]);
  });
}

/* ----- Presupuestos ----- */

async function cargarPresupuestos() {
  const periodo = $('#filtro-presupuestos').value || mesActual();
  const [anio, mes] = periodo.split('-');
  const { presupuestos } = await api(`/presupuestos?mes=${Number(mes)}&anio=${anio}`);
  pintarPresupuestos(presupuestos, periodo);
}

function pintarPresupuestos(presupuestos, periodo) {
  const items = presupuestos.map((p) => {
    const porcentaje = Number(p.porcentajeUsado);
    const claseBarra = p.excedido ? 'is-excedido' : porcentaje >= 80 ? 'is-alerta' : '';
    const disponible = Number(p.disponible);

    return el('li', { class: `presupuesto${p.excedido ? ' is-excedido' : ''}` },
      el('div', { class: 'presupuesto__head' },
        el('span', { class: 'presupuesto__nombre' },
          p.CategoriaNombre,
          p.excedido ? el('span', { class: 'badge badge--peligro' }, 'Excedido') : null
        ),
        el('button', { type: 'button', class: 'icon-btn icon-btn--peligro', dataset: { accion: 'eliminar-presupuesto', id: p.Id, nombre: p.CategoriaNombre }, 'aria-label': `Eliminar presupuesto de ${p.CategoriaNombre}`, title: 'Eliminar' }, icono('eliminar'))
      ),
      el('div', { class: 'presupuesto__cifras' },
        el('span', {}, 'Gastado ', el('strong', {}, dinero(p.gastado))),
        el('span', {}, 'Límite ', el('strong', {}, dinero(p.MontoLimite)))
      ),
      el('div', {
        class: 'progreso', role: 'progressbar',
        'aria-label': `Uso del presupuesto de ${p.CategoriaNombre}`,
        'aria-valuemin': 0, 'aria-valuemax': 100,
        'aria-valuenow': Math.min(porcentaje, 100), 'aria-valuetext': `${porcentaje}% usado`,
      }, el('div', { class: `progreso__barra ${claseBarra}`, style: `width: ${Math.min(porcentaje, 100)}%` })),
      el('div', { class: 'presupuesto__cifras' },
        el('span', { class: `presupuesto__disponible${disponible < 0 ? ' is-negativo' : ''}` },
          disponible < 0 ? `Excedido por ${dinero(Math.abs(disponible))}` : `Disponible ${dinero(disponible)}`),
        el('span', {}, `${porcentaje.toFixed(2)}%`)
      )
    );
  });

  $('#lista-presupuestos').replaceChildren(...items);
  const vacio = $('#presupuestos-vacio');
  vacio.textContent = `No hay presupuestos para ${mesLegible(periodo)}.`;
  vacio.hidden = presupuestos.length > 0;
}

async function guardarPresupuesto(evento) {
  evento.preventDefault();
  const form = evento.currentTarget;
  const monto = form.MontoLimite.value.trim();

  if (!form.CategoriaId.value) return mostrarErrorForm(form, 'Selecciona una categoría.');
  if (!monto || Number(monto) <= 0) return mostrarErrorForm(form, 'Escribe un límite mayor que 0.');
  if (!form.periodo.value) return mostrarErrorForm(form, 'Selecciona el mes.');

  const [anio, mes] = form.periodo.value.split('-');
  const datos = { CategoriaId: Number(form.CategoriaId.value), MontoLimite: monto, Mes: Number(mes), Anio: Number(anio) };

  await conEnvio(form, async () => {
    await api('/presupuestos', { method: 'POST', body: datos });
    toast('Presupuesto asignado.');
    // Muestra el mes del presupuesto recién creado.
    $('#filtro-presupuestos').value = form.periodo.value;
    form.CategoriaId.value = '';
    form.MontoLimite.value = '';
    await cargarPresupuestos();
  });
}

async function eliminarPresupuesto(id, nombre) {
  if (!confirm(`¿Eliminar el presupuesto de "${nombre}"? Esta acción no se puede deshacer.`)) return;
  await intentar(async () => {
    await api(`/presupuestos/${id}`, { method: 'DELETE' });
    toast('Presupuesto eliminado.');
    await cargarPresupuestos();
  });
}

/* ----- Administración ----- */

async function guardarCategoria(evento) {
  evento.preventDefault();
  const form = evento.currentTarget;
  const Nombre = form.Nombre.value.trim();
  if (!Nombre) return mostrarErrorForm(form, 'Escribe el nombre de la categoría.');

  await conEnvio(form, async () => {
    const { categoria } = await api('/categorias', { method: 'POST', body: { Nombre } });
    form.reset();
    toast(`Categoría "${categoria.Nombre}" creada.`);
    await cargarCategorias();
  });
}

/* ---------------------------------------------------------
   Eventos
   --------------------------------------------------------- */

function registrarEventos() {
  $('#tab-login').addEventListener('click', () => cambiarPestana('login'));
  $('#tab-registro').addEventListener('click', () => cambiarPestana('registro'));
  $('.tabs').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      cambiarPestana($('#tab-login').classList.contains('is-active') ? 'registro' : 'login');
      $('.tabs__tab.is-active').focus();
    }
  });
  $('#form-login').addEventListener('submit', (e) => enviarAuth(e, '/auth/login'));
  $('#form-registro').addEventListener('submit', (e) => enviarAuth(e, '/auth/register'));
  $('#btn-logout').addEventListener('click', () => cerrarSesion());

  $('#form-transaccion').addEventListener('submit', guardarTransaccion);
  $('#btn-cancelar-edicion').addEventListener('click', salirEdicion);
  $('#form-filtros').addEventListener('change', () => intentar(cargarTransacciones));
  $('#form-filtros').addEventListener('submit', (e) => e.preventDefault());
  $('#btn-limpiar-filtros').addEventListener('click', () => {
    $('#form-filtros').reset();
    intentar(cargarTransacciones);
  });
  $('#tabla-transacciones').addEventListener('click', (e) => {
    const boton = e.target.closest('button[data-accion]');
    if (!boton) return;
    const id = Number(boton.dataset.id);
    if (boton.dataset.accion === 'editar') entrarEdicion(id);
    if (boton.dataset.accion === 'eliminar') eliminarTransaccion(id);
  });

  $('#form-presupuesto').addEventListener('submit', guardarPresupuesto);
  $('#filtro-presupuestos').addEventListener('change', () => intentar(cargarPresupuestos));
  $('#lista-presupuestos').addEventListener('click', (e) => {
    const boton = e.target.closest('button[data-accion="eliminar-presupuesto"]');
    if (boton) eliminarPresupuesto(Number(boton.dataset.id), boton.dataset.nombre);
  });

  $('#form-categoria').addEventListener('submit', guardarCategoria);
}

/* ---------------------------------------------------------
   Inicio
   --------------------------------------------------------- */

async function iniciar() {
  registrarEventos();
  const token = leerToken();
  if (!token) return mostrarAuth();

  estado.token = token;
  try {
    await cargarPerfil();
  } catch (err) {
    if (err instanceof SesionExpirada) return;
    // El servidor no responde: se conserva el token para reintentar más tarde.
    estado.token = null;
    mostrarAuth(err.message);
  }
}

iniciar();
