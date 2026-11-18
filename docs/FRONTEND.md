# Gestor — Documentación del frontend

Interfaz web de Gestor: una aplicación de una sola página, escrita en HTML5, CSS3 y JavaScript puro (sin frameworks ni dependencias), que consume la API REST del backend.

- Código: [`public/index.html`](../public/index.html), [`public/styles.css`](../public/styles.css), [`public/app.js`](../public/app.js).
- Rutas de la API que usa: [API_Y_PROCEDIMIENTOS.md](API_Y_PROCEDIMIENTOS.md#6-endpoints).

**Contenido**

1. [Arquitectura y archivos](#1-arquitectura-y-archivos)
2. [Flujo de autenticación y RBAC en el cliente](#2-flujo-de-autenticación-y-rbac-en-el-cliente)
3. [Vistas y componentes interactivos](#3-vistas-y-componentes-interactivos)
4. [Medidas de seguridad en el frontend](#4-medidas-de-seguridad-en-el-frontend)
5. [Ejecución y personalización](#5-ejecución-y-personalización)

---

## 1. Arquitectura y archivos

Express sirve la carpeta `public/` como archivos estáticos (`express.static` en `index.js`). El frontend y la API comparten origen, así que `app.js` llama a rutas relativas (`/api/...`) y no necesita CORS en el uso normal.

No hay paso de compilación: los tres archivos se sirven tal cual y no se carga nada externo (ni fuentes, ni librerías, ni CDNs). El favicon y los iconos son SVG en línea.

```
public/
├── index.html   # Estructura de todas las vistas (auth + dashboard)
├── styles.css   # Tokens de diseño, temas, componentes y responsivo
└── app.js       # Estado, cliente de la API, renderizado y eventos
```

### 1.1 `index.html` — estructura semántica

Un único documento contiene todas las vistas; `app.js` muestra u oculta cada una con el atributo `hidden`.

| Elemento | Contenido |
|---|---|
| `<header class="topbar" id="topbar">` | Marca, correo y rol del usuario, botón **Cerrar sesión**. Oculto sin sesión. |
| `<section id="vista-auth">` | Tarjeta de acceso con dos pestañas (`role="tablist"`): `#form-login` y `#form-registro`. |
| `<div id="vista-dashboard">` | El dashboard, con cuatro secciones: |
| ↳ Resumen | Tres `<article>`: total de ingresos, total de egresos y saldo. |
| ↳ Transacciones | Formulario `#form-transaccion`, filtros `#form-filtros` y tabla `#tabla-transacciones`. |
| ↳ Presupuestos | Formulario `#form-presupuesto`, selector de mes `#filtro-presupuestos` y lista `#lista-presupuestos`. |
| ↳ Administración | `#panel-admin`: formulario `#form-categoria` y lista de categorías. Oculto salvo para administradores. |
| `<div id="toasts" aria-live="polite">` | Contenedor de notificaciones. |

Decisiones de marcado:

- **Accesibilidad:** cada campo va dentro de un `<label>`; las tablas usan `<th scope="col">`; los mensajes de error de los formularios tienen `role="alert"`; las barras de progreso, `role="progressbar"` con `aria-valuenow`; y los botones que solo tienen icono llevan `aria-label` (por ejemplo, "Editar movimiento del 03 nov 2026").
- **Límites alineados con la base de datos:** los atributos HTML reflejan las restricciones del backend: `maxlength="150"` en el correo, `minlength="8" maxlength="72"` en la contraseña, `maxlength="200"` en la descripción, `maxlength="50"` en el nombre de categoría, y `step="0.01"` con `max="99999999.99"` en los montos (`decimal(10,2)`).
- **Validación propia:** los formularios usan `novalidate`. Los mensajes del navegador se sustituyen por la validación de `app.js` y por los mensajes de la API, para que todos los errores se muestren igual.
- **Hooks para JavaScript:** los `<select>` de categorías se marcan con `data-categorias="opcional"` (transacciones: incluye "Sin categoría") o `data-categorias="requerida"` (presupuestos).

### 1.2 `styles.css` — diseño

**Tokens en `:root`.** Todos los colores, radios, sombras y fuentes son variables CSS:

| Grupo | Variables |
|---|---|
| Superficies y texto | `--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-muted` |
| Marca | `--primary`, `--primary-hover`, `--primary-soft`, `--on-primary` |
| Semánticos | `--ingreso` / `--ingreso-soft` (verde), `--egreso` / `--egreso-soft` (naranja), `--peligro` / `--peligro-soft` (rojo), `--alerta` (ámbar) |
| Forma y texto | `--radius`, `--radius-sm`, `--shadow`, `--font` (fuentes del sistema), `--mono` |

**Tema claro y oscuro automático.** `@media (prefers-color-scheme: dark)` redefine las mismas variables, así que ningún componente necesita reglas propias para el modo oscuro. El documento declara `<meta name="color-scheme" content="light dark">` para que los controles nativos (fechas, selects, barras de desplazamiento) también cambien de tema.

**Componentes principales:** `.card`, `.btn` (`--primary`, `--ghost`, `--sm`, `--block`), `.icon-btn`, `.field`, `.segmented` (selector Ingreso/Egreso con radios), `.tabs`, `.balance__card`, `.tabla`, `.presupuesto`, `.progreso`, `.badge`, `.chips` y `.toast`.

**Responsivo:**

| Punto de corte | Cambio |
|---|---|
| Base (> 900 px) | Cada panel en dos columnas: formulario de 320 px a la izquierda y contenido a la derecha. Tarjetas de resumen en tres columnas. |
| `max-width: 900px` | Los paneles pasan a una columna (el formulario queda encima del contenido). |
| `max-width: 640px` | Las tarjetas de resumen se apilan, se reducen los rellenos y el correo de la barra superior se recorta con puntos suspensivos. |
| `max-width: 380px` | Las filas de dos campos (monto + fecha, límite + mes) se apilan y se oculta el nombre "Gestor" de la marca. |

Otros detalles:

- La tabla de movimientos se desplaza horizontalmente dentro de `.table-wrap` (`overflow-x: auto`) en lugar de ensanchar la página. El contenedor lleva `position: relative` para que el encabezado oculto `.sr-only` de la columna de acciones no se escape del área de desplazamiento.
- Las filas de formulario usan `minmax(0, 1fr)` para que campos con ancho intrínseco grande, como `type="month"`, no se salgan de su columna.
- `[hidden] { display: none !important; }` garantiza que ocultar una vista funcione aunque el componente tenga su propio `display`.
- `@media (prefers-reduced-motion: reduce)` desactiva transiciones y animaciones.

### 1.3 `app.js` — lógica

El archivo está organizado en bloques:

| Bloque | Responsabilidad |
|---|---|
| Configuración | `API = '/api'`, `TOKEN_KEY = 'gestor_token'`, `LOCALE = 'es-MX'` y los formateadores `Intl` de moneda, mes y fecha. |
| Estado | Un único objeto `estado`. |
| Utilidades | `el()` (creación segura de nodos), `icono()`, `dinero()`, `fechaLegible()`, `mesLegible()`, `hoyISO()`, `toast()`, `mostrarErrorForm()` y `conEnvio()`. |
| Cliente de la API | `api()`, las clases `ApiError` y `SesionExpirada`, y `intentar()`. |
| Sesión | Lectura y escritura del token, login, registro, carga de perfil y cierre de sesión. |
| Dashboard | Carga y renderizado de categorías, transacciones, presupuestos y administración. |
| Eventos | `registrarEventos()`: todos los listeners en un solo lugar. |
| Inicio | `iniciar()`: restaura la sesión si hay token guardado. |

**Estado de la aplicación:**

```js
const estado = {
  token: null,                // JWT de la sesión actual
  usuario: null,              // { Id, Correo, Rol, FechaRegistro } desde /api/auth/perfil
  categorias: [],             // lista de /api/categorias
  transacciones: new Map(),   // Id -> transacción, para rellenar el formulario al editar
  editandoId: null,           // Id de la transacción en edición, o null
};
```

No hay librería de estado ni DOM virtual: cada `cargar…()` pide los datos a la API y su `pintar…()` reconstruye la parte correspondiente del DOM con `replaceChildren()`. Los filtros y meses seleccionados se leen directamente de los controles del formulario.

**Wrapper de peticiones `api(ruta, { method, body })`:**

```js
const { transacciones, resumen } = await api('/transacciones?tipo=Egreso');
await api('/presupuestos', { method: 'POST', body: { CategoriaId: 1, MontoLimite: '300', Mes: 11, Anio: 2026 } });
```

1. Antepone `/api` a la ruta.
2. Añade `Content-Type: application/json` si hay cuerpo, y `Authorization: Bearer <token>` si hay sesión.
3. Si la red falla, lanza `ApiError(0, 'No se pudo conectar con el servidor…')`.
4. Lee la respuesta como texto y la convierte a JSON solo si no está vacía. Así funcionan también las respuestas `204` de los `DELETE`.
5. Si la respuesta no es `2xx`:
   - Con `401` y sesión activa, cierra la sesión y lanza `SesionExpirada` (ver [2.3](#23-expiración-y-tokens-inválidos-401)).
   - En cualquier otro caso, lanza `ApiError(status, mensaje)` con el mensaje `error` que envió el backend.

Dos ayudantes deciden dónde se muestran los errores:

- **`conEnvio(form, accion)`**, para formularios: deshabilita el botón de envío mientras dura la petición y muestra el error dentro del formulario (`.form__error`).
- **`intentar(accion)`**, para cargas y acciones sin formulario: muestra el error como notificación roja.

Ninguno de los dos muestra nada ante `SesionExpirada`, porque en ese caso ya se ha vuelto a la pantalla de acceso.

---

## 2. Flujo de autenticación y RBAC en el cliente

### 2.1 Login y registro

```
Formulario ──POST /api/auth/login|register──► { token, usuario }
     │
     ├─ estado.token = token
     ├─ localStorage['gestor_token'] = token
     └─ GET /api/auth/perfil ──► estado.usuario ──► mostrarDashboard()
```

- Las pestañas **Iniciar sesión** y **Crear cuenta** alternan los dos formularios. Actualizan `aria-selected` y `tabindex`, y también responden a las flechas ← →.
- **Validación previa en el cliente:**
  - Ambos formularios: correo y contraseña obligatorios.
  - Registro: además, contraseña de al menos 8 caracteres.
  - El resto (formato del correo, correo duplicado, credenciales incorrectas) lo valida el backend, y su mensaje se muestra en el formulario.
- Tras un registro correcto se entra directamente al dashboard con el token recibido, sin pedir un login adicional.

### 2.2 Almacenamiento y envío del token

- **Dónde se guarda:** el token se guarda en `localStorage` con la clave `gestor_token`, así que la sesión sobrevive a recargas y a cerrar la pestaña. Se borra al cerrar sesión o cuando el servidor lo rechaza.
- **Cómo se envía:** `api()` lo envía en cada petición como `Authorization: Bearer <token>`.
- **Sin almacenamiento disponible:** todos los accesos a `localStorage` están envueltos en `try/catch`. Si el navegador lo bloquea (modo privado estricto, políticas de la empresa), la aplicación sigue funcionando, pero la sesión no persiste al recargar.

### 2.3 Expiración y tokens inválidos (`401`)

Si cualquier petición devuelve `401` mientras hay sesión:

1. Se llama a `cerrarSesion()`:
   - Borra el token de memoria y de `localStorage`, el usuario y las transacciones cargadas.
   - Sale del modo edición, resetea todos los formularios y vuelve a la pestaña de login.
2. Se muestra un aviso sobre el formulario de acceso:
   - Si el backend respondió `Token expirado`: *"Tu sesión expiró. Vuelve a iniciar sesión."*
   - En cualquier otro caso (token manipulado, firmado con otra clave, etc.): *"Tu sesión ya no es válida. Vuelve a iniciar sesión."*
3. La llamada original lanza `SesionExpirada`, que se ignora en silencio para no mostrar además un error genérico.

Los `401` del propio formulario de login (credenciales inválidas) **no** cierran nada: en ese momento no hay sesión, así que se tratan como un error normal del formulario.

### 2.4 Carga del perfil y restauración de la sesión

**El cliente no decodifica el JWT.** No lee el payload con `atob` ni con ninguna librería. El correo y el rol se obtienen siempre de `GET /api/auth/perfil`, que lee los datos actuales de la base de datos. Así:

- El servidor confirma que el token es válido antes de mostrar el dashboard.
- Si el rol de un usuario cambió en la base de datos, la barra superior y el panel de administración reflejan el rol real.

Al abrir la página, `iniciar()`:

1. Sin token guardado → muestra la vista de acceso.
2. Con token → llama a `/api/auth/perfil`:
   - **Éxito:** muestra el dashboard.
   - **`401`:** cierra la sesión y muestra el aviso de [2.3](#23-expiración-y-tokens-inválidos-401).
   - **Otro error** (servidor caído, usuario borrado): muestra la vista de acceso con el mensaje del error. El token sigue en `localStorage` y se reemplaza en el siguiente login.

### 2.5 Renderizado condicional por rol

`mostrarDashboard()` aplica el rol de `estado.usuario.Rol`:

```js
$('#panel-admin').hidden = Rol !== 'administrador';
badge.classList.toggle('badge--admin', Rol === 'administrador');
```

- El **panel de administración** solo se muestra a administradores.
- La etiqueta del rol en la barra superior usa un estilo destacado para `administrador`.

> **Importante:** ocultar el panel es solo una cuestión de interfaz. La seguridad real está en el backend: `POST /api/categorias` está protegido con `verificarRol('administrador')`, así que un estudiante que muestre el panel desde las herramientas del navegador recibiría `403` al intentar crear una categoría.

---

## 3. Vistas y componentes interactivos

Al entrar al dashboard se cargan primero las categorías (las necesitan los `<select>`) y después, en paralelo, las transacciones y los presupuestos.

### 3.1 Tarjetas de resumen

- Muestran `totalIngresos`, `totalEgresos` y `saldo` del objeto `resumen` que devuelve `GET /api/transacciones`. **No se recalculan en el navegador.**
- Usan los **mismos filtros** que el historial. El subtítulo indica qué se está viendo:
  - Sin filtros: "Todos los movimientos".
  - Con filtros, por ejemplo: "noviembre de 2026 · solo egresos".
- Un saldo negativo se muestra como `−$1,234.50` y en rojo (clase `is-negativo`).
- **Formato de moneda:** `Intl.NumberFormat('es-MX')` con 2 decimales y el prefijo `$`.

### 3.2 Transacciones

**Formulario (alta).**

| Campo | Control | Envío a la API |
|---|---|---|
| Tipo | Selector segmentado Ingreso / Egreso (radios), con color verde o naranja | `Tipo` |
| Monto | `type="number"`, `step="0.01"` | `Monto`, como texto (p. ej. `"150.50"`), para no perder precisión decimal |
| Fecha | `type="date"`, con la fecha de hoy por defecto | `Fecha` (`YYYY-MM-DD`) |
| Categoría | `<select>` cargado desde `/api/categorias`, con la opción "Sin categoría" | `CategoriaId` como número, o `null` |
| Descripción | Texto, opcional | `Descripcion`, o `null` si queda vacía |

Al guardar se envía `POST /api/transacciones`. Después se muestra una notificación, se limpia el formulario y se recargan **transacciones y presupuestos**, porque el `gastado` de los presupuestos depende de los egresos.

**Tabla de historial.**

- **Columnas:** fecha (por ejemplo, "03 nov 2026"), descripción, categoría, monto y acciones.
- **Monto:** `+$` en verde para ingresos y `−$` en naranja para egresos.
- **Valores vacíos:** sin descripción se muestra "—", y sin categoría, "Sin categoría", ambos en gris.
- **Lista vacía:** la tabla se oculta y se muestra "No hay movimientos para mostrar".
- **Fechas:** se formatean con `Date.UTC` y `timeZone: 'UTC'`, para que `2026-11-01` no se muestre como el 31 de octubre en zonas horarias negativas.
- **Acciones:** los botones de editar y eliminar usan **delegación de eventos**: un único listener en el `<tbody>` identifica la fila por `data-id`.

**Filtros.**

- **Tipo:** `<select>` con Todos, Ingresos o Egresos → parámetro `tipo`.
- **Mes:** `<input type="month">` → el valor `YYYY-MM` se convierte en los parámetros `anio` y `mes`.
- Cualquier cambio recarga el historial y las tarjetas. **Limpiar** resetea ambos filtros.

**Modo edición.**

1. El botón ✏️ de una fila rellena el formulario con los datos de esa transacción (tomados de `estado.transacciones`, sin una petición extra) y guarda su `Id` en `estado.editandoId`.
2. El título cambia a "Editar movimiento", el botón a "Guardar cambios", aparece **Cancelar** y la fila se resalta (`is-editando`). La página se desplaza hasta el formulario y pone el foco en el monto.
3. Al guardar se envía `PUT /api/transacciones/:id` con todos los campos. Si la categoría queda vacía, se envía `CategoriaId: null` para quitarla.
4. Guardar, Cancelar o eliminar la fila en edición vuelven el formulario al modo alta.

**Eliminación.** El botón 🗑️ pide confirmación con `confirm()`, mostrando el tipo, el monto y la fecha. Después envía `DELETE /api/transacciones/:id` y recarga transacciones y presupuestos.

### 3.3 Presupuestos

**Formulario.**

- **Campos:** categoría (obligatoria), límite mensual y mes (`type="month"`, de 2020 a 2100), que se convierte en `Mes` y `Anio` para `POST /api/presupuestos`.
- **Al crear:** la vista cambia automáticamente al mes del presupuesto recién creado, para que se vea en la lista.
- **Duplicados:** si ya existe un presupuesto para esa categoría y mes, el formulario muestra el mensaje `409` del backend.

**Lista.**

- Se muestran los presupuestos del mes elegido en `#filtro-presupuestos`, que por defecto es el mes actual (`GET /api/presupuestos?mes=&anio=`).
- Cada tarjeta incluye:
  - Nombre de la categoría y botón de eliminar.
  - "Gastado $X" y "Límite $Y".
  - Barra de progreso.
  - "Disponible $Z" (o "Excedido por $Z") y el porcentaje usado.

**Barra de progreso y alertas.**

| Condición | Barra | Tarjeta |
|---|---|---|
| `porcentajeUsado < 80` | Verde | Normal |
| `porcentajeUsado ≥ 80` y `excedido === false` | Ámbar (`is-alerta`) | Normal |
| `excedido === true` | Roja (`is-excedido`) | Borde y fondo rojos, etiqueta **Excedido** y texto "Excedido por $X" en rojo |

- El ancho de la barra es `min(porcentajeUsado, 100)%`: nunca desborda, aunque el gasto supere el límite.
- El estado de alerta roja se decide **solo** con el campo `excedido` que calcula el backend (`gastado > MontoLimite`). Un presupuesto exactamente al 100 % se muestra en ámbar, no en rojo.
- Cada barra expone `role="progressbar"`, `aria-valuenow` y `aria-valuetext` (por ejemplo, "66.67% usado") para lectores de pantalla.

**Eliminación.** El botón de eliminar pide confirmación con el nombre de la categoría, envía `DELETE /api/presupuestos/:id` y recarga la lista.

### 3.4 Administración: creación de categorías

Visible solo para `administrador` (ver [2.5](#25-renderizado-condicional-por-rol)).

- El formulario envía `POST /api/categorias` con `{ Nombre }`. El nombre se recorta y no puede quedar vacío.
- Tras crearla se vuelven a cargar las categorías, que aparecen al instante en:
  - La lista de chips del panel (`#Id Nombre`) y el contador "N en total".
  - Los `<select>` de transacciones y presupuestos, que conservan la opción que ya estuviera elegida.
- Un nombre duplicado, sin distinguir mayúsculas, muestra el mensaje `409` del backend en el formulario.

### 3.5 Notificaciones

`toast(mensaje, tipo)` añade un aviso en la esquina inferior derecha:

- **Éxito:** "Ingreso registrado.", "Presupuesto asignado.", etc. Desaparece a los 3.5 s.
- **Error:** en rojo, con `role="alert"`. Desaparece a los 6 s.

El contenedor tiene `aria-live="polite"` para que los lectores de pantalla anuncien los avisos.

---

## 4. Medidas de seguridad en el frontend

### 4.1 Prevención de XSS: nada del servidor pasa por `innerHTML`

Todos los datos que vienen de la API (descripciones, nombres de categoría, correos, mensajes de error) pueden contener texto escrito por usuarios. Si se insertaran con `innerHTML`, un texto como `<img src=x onerror=alert(1)>` se ejecutaría como código en el navegador de quien lo viera.

Para evitarlo, todo el contenido dinámico se crea con la API del DOM, mediante el ayudante `el()`:

```js
function el(tag, props = {}, ...hijos) {
  const nodo = document.createElement(tag);
  // ... atributos con setAttribute / className / dataset / textContent
  for (const hijo of hijos.flat()) {
    nodo.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return nodo;
}

// Uso: la descripción se inserta como texto, nunca como HTML
el('td', { class: 'desc' }, t.Descripcion || '—');
```

- Los hijos de tipo texto se convierten en `Text` nodes (`document.createTextNode`), y los valores sueltos se asignan con `textContent`. El navegador los trata siempre como texto literal.
- Los atributos se asignan con `setAttribute`, `className` y `dataset`, nunca concatenando HTML.
- Las listas se reemplazan con `replaceChildren(...nodos)`.

**Única excepción, sin datos externos:** la función `icono()` usa `innerHTML` para crear los dos iconos SVG (editar y eliminar). Las rutas SVG son cadenas fijas escritas en el propio `app.js`; ningún dato del servidor ni del usuario pasa por ahí.

**Verificación:** durante las pruebas se registró una transacción con la descripción `Concierto <b>con amigos</b> <img src=x onerror=alert(1)>`. En la tabla se mostró como texto literal: ni negrita ni ejecución del `onerror`.

### 4.2 Otras medidas

| Medida | Detalle |
|---|---|
| **El cliente no decide permisos** | Mostrar u ocultar el panel de administración es solo interfaz. Cada acción se autoriza en el backend con `verificarToken` y `verificarRol`, y cada transacción y presupuesto se filtra por el usuario del token. |
| **El rol no se lee del token** | El cliente no decodifica el JWT. Usa el perfil que devuelve el servidor, así que modificar el payload del token no sirve para engañar a la interfaz; además, el servidor rechaza la firma con `401`. |
| **Limpieza al cerrar sesión** | `cerrarSesion()` borra el token, el usuario, las transacciones en memoria y todos los formularios. |
| **Errores sin detalles internos** | Solo se muestran los mensajes `error` que envía la API, que nunca incluyen información de la base de datos. Los fallos de red muestran un mensaje genérico. |
| **Sin recursos de terceros** | No se cargan scripts, estilos ni fuentes externos, así que ningún tercero puede inyectar código ni rastrear al usuario. |
| **Confirmación de acciones destructivas** | Eliminar una transacción o un presupuesto pide confirmación y muestra qué se va a borrar. |

### 4.3 Consideración: token en `localStorage`

Guardar el JWT en `localStorage` es sencillo y permite mantener la sesión al recargar, pero el token es accesible desde cualquier JavaScript que se ejecute en la página. Por eso la prevención de XSS de [4.1](#41-prevención-de-xss-nada-del-servidor-pasa-por-innerhtml) es esencial: si un atacante lograra ejecutar código, podría leer el token. La caducidad del token (`JWT_EXPIRES_IN`, 8 h por defecto) limita la ventana de uso de un token robado.

Una alternativa más robusta para el futuro sería que el servidor enviara el token en una cookie `HttpOnly; Secure; SameSite=Strict`, inaccesible desde JavaScript. Eso requeriría cambios en el backend y protección CSRF.

---

## 5. Ejecución y personalización

- **Ejecutar:** arranca el backend con `npm run dev` y abre `http://localhost:3000`. Express sirve el frontend y la API en el mismo puerto. Los detalles de configuración están en el [README](../README.md).
- **Formato regional:** los importes y las fechas usan la constante `LOCALE = 'es-MX'` al principio de `app.js`. Cambiarla (por ejemplo, a `'es-ES'`) ajusta los separadores decimales y de miles y los nombres de los meses. El símbolo `$` está fijo en la función `dinero()`.
- **Colores:** todos se definen como variables en `:root` (y en el bloque `prefers-color-scheme: dark`) de `styles.css`. Cambiar `--primary` modifica el color de marca en toda la interfaz.
- **Umbral de alerta ámbar:** el 80 % está en `pintarPresupuestos()` (`porcentaje >= 80`).
- **Compatibilidad:** requiere un navegador moderno (Chrome, Edge, Firefox o Safari recientes). Se usan `replaceChildren`, `color-mix()`, `<input type="month">` y `Intl`. En navegadores sin `type="month"`, ese campo se muestra como texto y hay que escribir `YYYY-MM`.
