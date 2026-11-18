# Gestor — API y procedimientos del backend

Documentación técnica del backend de Gestor: el estado real de la base de datos, los cambios aplicados, cómo se verificó el código y la referencia completa de la API REST.

Para instalar y ejecutar el proyecto, consulta el [README](../README.md).

**Contenido**

1. [Base de datos](#1-base-de-datos)
2. [Procedimientos aplicados](#2-procedimientos-aplicados)
3. [Acceso a datos: consultas parametrizadas](#3-acceso-a-datos-consultas-parametrizadas)
4. [Arquitectura de pruebas](#4-arquitectura-de-pruebas)
5. [Convenciones generales de la API](#5-convenciones-generales-de-la-api)
6. [Endpoints](#6-endpoints)
   - [Health](#61-health)
   - [Autenticación — `/api/auth`](#62-autenticación--apiauth)
   - [Categorías — `/api/categorias`](#63-categorías--apicategorias)
   - [Transacciones — `/api/transacciones`](#64-transacciones--apitransacciones)
   - [Presupuestos — `/api/presupuestos`](#65-presupuestos--apipresupuestos)
7. [Limitaciones conocidas](#7-limitaciones-conocidas)

---

## 1. Base de datos

- **Motor:** Microsoft SQL Server 2022.
- **Base de datos:** `Gestor`.
- **Intercalación:** `Modern_Spanish_CI_AS`. Las comparaciones de texto **no distinguen mayúsculas de minúsculas** (`'Comida'` = `'comida'`).

### 1.1 Esquema real

Leído directamente de SQL Server (`INFORMATION_SCHEMA` y vistas `sys.*`).

#### Usuarios

| Columna | Tipo | Nulo | Restricciones |
|---|---|---|---|
| `Id` | `int` | No | PK, IDENTITY |
| `Correo` | `nvarchar(150)` | No | UNIQUE |
| `PasswordHash` | `nvarchar(255)` | No | — |
| `FechaRegistro` | `datetime` | Sí | DEFAULT `GETDATE()` |
| `Rol` | `nvarchar(20)` | No | DEFAULT `'estudiante'` |

#### Categorias

| Columna | Tipo | Nulo | Restricciones |
|---|---|---|---|
| `Id` | `int` | No | PK, IDENTITY |
| `Nombre` | `nvarchar(50)` | No | Índice único `UX_Categorias_Nombre` |

#### Transacciones

| Columna | Tipo | Nulo | Restricciones |
|---|---|---|---|
| `Id` | `int` | No | PK, IDENTITY |
| `UsuarioId` | `int` | No | FK → `Usuarios.Id` |
| `Tipo` | `nvarchar(10)` | No | CHECK `CK_Transacciones_Tipo`: `'Ingreso'` o `'Egreso'` |
| `Monto` | `decimal(10,2)` | No | CHECK: `Monto > 0` |
| `Fecha` | `date` | No | — |
| `CategoriaId` | `int` | Sí | FK → `Categorias.Id` |
| `Descripcion` | `nvarchar(200)` | Sí | — |

#### Presupuestos

| Columna | Tipo | Nulo | Restricciones |
|---|---|---|---|
| `Id` | `int` | No | PK, IDENTITY |
| `UsuarioId` | `int` | No | FK → `Usuarios.Id` |
| `CategoriaId` | `int` | No | FK → `Categorias.Id` |
| `MontoLimite` | `decimal(10,2)` | No | — |
| `Mes` | `int` | No | — |
| `Anio` | `int` | No | — |

Todas las claves foráneas usan `ON DELETE NO ACTION`: no se puede borrar un usuario o una categoría mientras tenga transacciones o presupuestos asociados.

### 1.2 Script equivalente

Script reconstruido a partir del esquema real, útil para crear la base en otra máquina. Los nombres de las restricciones generados automáticamente por SQL Server serán distintos, pero el comportamiento es el mismo.

```sql
CREATE DATABASE Gestor;
GO
USE Gestor;
GO

CREATE TABLE Usuarios (
    Id            int IDENTITY(1,1) PRIMARY KEY,
    Correo        nvarchar(150) NOT NULL UNIQUE,
    PasswordHash  nvarchar(255) NOT NULL,
    FechaRegistro datetime NULL DEFAULT GETDATE(),
    Rol           nvarchar(20)  NOT NULL DEFAULT 'estudiante'
);

CREATE TABLE Categorias (
    Id     int IDENTITY(1,1) PRIMARY KEY,
    Nombre nvarchar(50) NOT NULL
);
CREATE UNIQUE INDEX UX_Categorias_Nombre ON Categorias(Nombre);

CREATE TABLE Transacciones (
    Id          int IDENTITY(1,1) PRIMARY KEY,
    UsuarioId   int           NOT NULL REFERENCES Usuarios(Id),
    Tipo        nvarchar(10)  NOT NULL,
    Monto       decimal(10,2) NOT NULL CHECK (Monto > 0),
    Fecha       date          NOT NULL,
    CategoriaId int           NULL REFERENCES Categorias(Id),
    Descripcion nvarchar(200) NULL,
    CONSTRAINT CK_Transacciones_Tipo CHECK (Tipo IN ('Ingreso', 'Egreso'))
);

CREATE TABLE Presupuestos (
    Id          int IDENTITY(1,1) PRIMARY KEY,
    UsuarioId   int           NOT NULL REFERENCES Usuarios(Id),
    CategoriaId int           NOT NULL REFERENCES Categorias(Id),
    MontoLimite decimal(10,2) NOT NULL,
    Mes         int           NOT NULL,
    Anio        int           NOT NULL
);
```

---

## 2. Procedimientos aplicados

Cambios realizados sobre la base de datos original durante el desarrollo del backend.

### 2.1 Columna `Rol` en `Usuarios`

El control de acceso por roles necesitaba guardar el rol de cada usuario, y la tabla original no tenía esa columna. Se añadió `Rol` como `nvarchar(20) NOT NULL` con valor por defecto `'estudiante'`. Las filas existentes reciben ese valor automáticamente. Sentencia equivalente:

```sql
ALTER TABLE Usuarios ADD Rol nvarchar(20) NOT NULL DEFAULT 'estudiante';
```

### 2.2 Restricción `CHECK` de `Tipo` en `Transacciones`

La restricción original solo permitía `'ingreso'` y `'gasto'`, pero la API usa `'Ingreso'` y `'Egreso'`, así que todos los egresos fallaban al guardarse. La tabla estaba vacía, de modo que no hubo que migrar datos. Se reemplazó la restricción:

```sql
ALTER TABLE Transacciones DROP CONSTRAINT CK__Transaccio__Tipo__3E52440B;
ALTER TABLE Transacciones ADD CONSTRAINT CK_Transacciones_Tipo CHECK (Tipo IN ('Ingreso', 'Egreso'));
```

### 2.3 Índice único en `Categorias.Nombre`

El controlador ya comprueba que no exista una categoría con el mismo nombre antes de crearla, pero dos peticiones simultáneas podrían pasar esa comprobación a la vez. El índice único lo impide en la propia base de datos, y el controlador traduce ese error a `409`:

```sql
CREATE UNIQUE INDEX UX_Categorias_Nombre ON Categorias(Nombre);
```

### 2.4 Pendiente (opcional): restricciones en `Presupuestos`

`Presupuestos` **no tiene** índice único ni restricciones `CHECK`. Hoy los duplicados (mismo usuario, categoría, mes y año) y los valores inválidos se evitan solo en el controlador. Para protegerlo también en la base de datos:

```sql
CREATE UNIQUE INDEX UX_Presupuestos_Usuario_Categoria_Periodo ON Presupuestos(UsuarioId, CategoriaId, Mes, Anio);
ALTER TABLE Presupuestos ADD CONSTRAINT CK_Presupuestos_MontoLimite CHECK (MontoLimite > 0);
ALTER TABLE Presupuestos ADD CONSTRAINT CK_Presupuestos_Mes CHECK (Mes BETWEEN 1 AND 12);
```

El controlador ya responde `409` si se viola ese índice, así que se puede aplicar sin tocar el código.

---

## 3. Acceso a datos: consultas parametrizadas

Todo el SQL vive en `src/models`. Ningún valor recibido del cliente se concatena en una consulta: siempre viaja como parámetro tipado.

```js
const { sql, getPool } = require('../config/db');

const pool = await getPool();
const result = await pool
  .request()
  .input('id', sql.Int, id)
  .input('usuarioId', sql.Int, usuarioId)
  .query('SELECT ... FROM Transacciones WHERE Id = @id AND UsuarioId = @usuarioId');
```

Puntos clave:

- **Pool de conexiones único** (`src/config/db.js`): se crea en la primera llamada a `getPool()` y se reutiliza en toda la aplicación. Si la conexión inicial falla, el siguiente intento vuelve a probar. `closePool()` lo cierra al apagar el servidor.
- **Tipos que coinciden con el esquema:** `sql.Int`, `sql.NVarChar(50)`, `sql.NVarChar(200)`, `sql.Decimal(10, 2)`, etc.
- **Filtros dinámicos seguros:** en los listados con filtros opcionales solo se añaden fragmentos de SQL fijos (`'t.Tipo = @tipo'`), y el valor siempre va como parámetro.
- **Propiedad de los datos en el propio SQL:** `UPDATE` y `DELETE` incluyen `AND UsuarioId = @usuarioId`, así que es imposible modificar un registro de otro usuario aunque se conozca su `Id`.
- **Fechas:** `Fecha` se envía como texto `YYYY-MM-DD` y se convierte con `CONVERT(date, @fecha, 23)`. Se devuelve con `CONVERT(char(10), Fecha, 23)` para evitar desfases de zona horaria en JavaScript.
- **Cálculos en SQL:** el `resumen` de transacciones y los campos `gastado`, `disponible`, `porcentajeUsado` y `excedido` de presupuestos se calculan en la base de datos con `SUM`, `CASE` y `OUTER APPLY`, aplicando los mismos filtros que el listado.

---

## 4. Arquitectura de pruebas

> **Estado actual:** el repositorio **no incluye** todavía una suite de pruebas automatizada (`npm test` es el valor por defecto de npm). Las pruebas descritas abajo se ejecutaron con scripts independientes durante el desarrollo; incorporarlas al repositorio (por ejemplo con `node --test`) es un paso pendiente.

Cada módulo se verificó en dos capas.

### 4.1 Pruebas de integración HTTP (sin base de datos)

- Se arranca la aplicación Express real (`index.js`) y se le hacen peticiones HTTP con `fetch`.
- Las funciones de los **modelos se sustituyen por versiones en memoria**, así que no se escribe nada en SQL Server.
- Cubren validaciones, códigos de respuesta, permisos por rol, aislamiento entre usuarios (un usuario no puede ver, editar ni borrar datos de otro) y casos de seguridad del JWT: token ausente, falso, firmado con otra clave, expirado y con `alg: none`.

| Módulo | Pruebas |
|---|---|
| Autenticación y RBAC | 25 |
| Categorías y Transacciones | 46 |
| Presupuestos | 38 |

### 4.2 Pruebas del SQL real con `ROLLBACK`

- Se ejecutan las funciones reales de los modelos contra la base de datos `Gestor`, **dentro de una transacción que siempre se revierte**.
- Se crean usuarios, categorías, transacciones y presupuestos temporales, se comprueban los resultados y, al terminar, se verifica que no queda ningún registro de prueba.
- Validan que el SQL es correcto contra el esquema real, que las restricciones `CHECK` y las claves foráneas se comportan como se espera, y que los cálculos son exactos. Por ejemplo, en presupuestos: que `gastado` solo suma egresos del mismo usuario, categoría, mes y año; que `porcentajeUsado` se redondea a 2 decimales; y que `excedido` es booleano.
- **Efecto secundario:** las columnas `IDENTITY` avanzan aunque la transacción se revierta, así que puede haber saltos en los `Id`.

Estas pruebas detectaron un error real: SQL Server usa el código de error `547` tanto para claves foráneas como para restricciones `CHECK`. El controlador de transacciones ahora distingue ambos casos por el mensaje del error.

### 4.3 Inspección del esquema (solo lectura)

Antes de escribir cada módulo se consultó `INFORMATION_SCHEMA.COLUMNS`, `sys.check_constraints`, `sys.indexes` y `sys.foreign_keys`, para ajustar las validaciones a los tipos y longitudes reales. Así se detectó, por ejemplo, la restricción `'ingreso'`/`'gasto'` descrita en [2.2](#22-restricción-check-de-tipo-en-transacciones).

---

## 5. Convenciones generales de la API

- **URL base:** `http://localhost:3000/api` (el puerto depende de `PORT`).
- **Formato:** JSON en peticiones y respuestas. Las peticiones con cuerpo deben enviar `Content-Type: application/json`.
- **Autenticación:** las rutas protegidas exigen el encabezado `Authorization: Bearer <token>`.
- **Nombres de campos:**
  - En `/api/auth` el cuerpo usa minúsculas (`correo`, `password`).
  - En los demás módulos se usan los nombres de las columnas (`Nombre`, `Tipo`, `Monto`, `CategoriaId`, …).
- **Números y fechas:**
  - Los montos aceptan número (`150.5`) o texto numérico (`"150.50"`), con hasta 2 decimales.
  - Los Ids, meses y años aceptan número o texto de solo dígitos.
  - Las fechas se envían y se devuelven como `"YYYY-MM-DD"`.
- **Errores:** siempre con la forma `{ "error": "mensaje" }`.

### Respuestas comunes a todas las rutas

| Código | Cuándo | Cuerpo |
|---|---|---|
| `400` | El cuerpo no es JSON válido | `{ "error": "El cuerpo de la petición no es JSON válido" }` |
| `401` | Ruta protegida sin token | `{ "error": "Token no proporcionado" }` |
| `401` | Token mal formado o con firma inválida | `{ "error": "Token inválido" }` |
| `401` | Token caducado | `{ "error": "Token expirado" }` |
| `404` | Ruta `/api/...` que no existe | `{ "error": "Recurso no encontrado" }` |
| `500` | Error inesperado (base de datos caída, `JWT_SECRET` sin definir, …) | `{ "error": "Error interno del servidor" }` |

Los errores `500` se registran con detalle en la consola del servidor, pero nunca se envían al cliente.

---

## 6. Endpoints

### Resumen

| Método | Ruta | Token | Rol |
|---|---|---|---|
| `GET` | `/api/health` | No | — |
| `POST` | `/api/auth/register` | No | — |
| `POST` | `/api/auth/login` | No | — |
| `GET` | `/api/auth/perfil` | Sí | Cualquiera |
| `GET` | `/api/categorias` | Sí | Cualquiera |
| `POST` | `/api/categorias` | Sí | `administrador` |
| `GET` | `/api/transacciones` | Sí | Cualquiera (solo las propias) |
| `POST` | `/api/transacciones` | Sí | Cualquiera |
| `PUT` | `/api/transacciones/:id` | Sí | Cualquiera (solo las propias) |
| `DELETE` | `/api/transacciones/:id` | Sí | Cualquiera (solo las propias) |
| `GET` | `/api/presupuestos` | Sí | Cualquiera (solo los propios) |
| `POST` | `/api/presupuestos` | Sí | Cualquiera |
| `PUT` | `/api/presupuestos/:id` | Sí | Cualquiera (solo los propios) |
| `DELETE` | `/api/presupuestos/:id` | Sí | Cualquiera (solo los propios) |

---

### 6.1 Health

#### `GET /api/health`

Comprueba que el servidor está en marcha y que puede consultar SQL Server (ejecuta `SELECT 1`).

- **Token:** no.

| Código | Cuerpo |
|---|---|
| `200` | `{ "status": "ok", "database": "conectada" }` |
| `503` | `{ "status": "error", "database": "no disponible" }` |

---

### 6.2 Autenticación — `/api/auth`

#### `POST /api/auth/register`

Crea una cuenta de **estudiante** y devuelve un token.

- **Token:** no.
- **Body:**

```json
{
  "correo": "ana@universidad.edu",
  "password": "miClave2026"
}
```

Reglas:

- `correo`: se recortan los espacios y se pasa a minúsculas; debe tener formato de correo.
- `password`: entre 8 y 72 caracteres. El límite de 72 se debe a que bcrypt ignora lo que pase de 72 bytes.
- Cualquier campo `rol` que se envíe **se ignora**: siempre se crea con rol `estudiante`.

**`201 Created`**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": {
    "Id": 1,
    "Correo": "ana@universidad.edu",
    "Rol": "estudiante",
    "FechaRegistro": "2026-11-18T10:15:00.000Z"
  }
}
```

| Código | Cuándo | Mensaje |
|---|---|---|
| `400` | Correo con formato inválido o ausente | `Correo no válido` |
| `400` | Contraseña demasiado corta o larga | `La contraseña debe tener entre 8 y 72 caracteres` |
| `409` | El correo ya existe | `El correo ya está registrado` |
| `500` | Error interno | `Error interno del servidor` |

#### `POST /api/auth/login`

- **Token:** no.
- **Body:**

```json
{
  "correo": "ana@universidad.edu",
  "password": "miClave2026"
}
```

El correo no distingue mayúsculas de minúsculas.

**`200 OK`**: misma forma que el registro (`token` + `usuario`, sin `PasswordHash`).

| Código | Cuándo | Mensaje |
|---|---|---|
| `400` | Falta el correo o la contraseña | `Correo y contraseña son obligatorios` |
| `401` | El correo no existe o la contraseña es incorrecta (misma respuesta en ambos casos) | `Credenciales inválidas` |
| `500` | Error interno | `Error interno del servidor` |

#### Contenido del token

Payload firmado con HS256:

```json
{ "Id": 1, "Correo": "ana@universidad.edu", "Rol": "estudiante", "iat": 1794990000, "exp": 1795018800 }
```

#### `GET /api/auth/perfil`

Devuelve los datos actuales del usuario autenticado, leídos de la base de datos (no del token).

- **Token:** sí.

**`200 OK`**

```json
{
  "usuario": {
    "Id": 1,
    "Correo": "ana@universidad.edu",
    "Rol": "estudiante",
    "FechaRegistro": "2026-11-18T10:15:00.000Z"
  }
}
```

| Código | Cuándo | Mensaje |
|---|---|---|
| `401` | Token ausente, inválido o expirado | Ver [respuestas comunes](#respuestas-comunes-a-todas-las-rutas) |
| `404` | El usuario del token ya no existe | `Usuario no encontrado` |

---

### 6.3 Categorías — `/api/categorias`

#### `GET /api/categorias`

Lista todas las categorías ordenadas por `Id`.

- **Token:** sí (cualquier rol).

**`200 OK`**

```json
{
  "categorias": [
    { "Id": 1, "Nombre": "Comida" },
    { "Id": 2, "Nombre": "Transporte" }
  ]
}
```

| Código | Cuándo |
|---|---|
| `401` | Sin token o token no válido |

#### `POST /api/categorias`

Crea una categoría.

- **Token:** sí.
- **Rol:** `administrador`.
- **Body:**

```json
{ "Nombre": "Libros y material" }
```

Reglas:

- Se recortan los espacios de `Nombre`.
- No puede quedar vacío ni superar 50 caracteres.
- No puede existir otra categoría con el mismo nombre, sin distinguir mayúsculas.

**`201 Created`**

```json
{ "categoria": { "Id": 11, "Nombre": "Libros y material" } }
```

| Código | Cuándo | Mensaje |
|---|---|---|
| `400` | `Nombre` vacío o ausente | `El campo Nombre es obligatorio` |
| `400` | `Nombre` demasiado largo | `Nombre no puede superar 50 caracteres` |
| `401` | Sin token o token no válido | — |
| `403` | El usuario no es administrador | `No tienes permiso para acceder a este recurso` |
| `409` | Ya existe una categoría con ese nombre | `Ya existe una categoría con ese nombre` |

---

### 6.4 Transacciones — `/api/transacciones`

Todas las rutas requieren token y operan **solo sobre las transacciones del usuario autenticado**.

#### Objeto `transaccion`

```json
{
  "Id": 5,
  "Tipo": "Egreso",
  "Monto": 120.5,
  "Fecha": "2026-11-03",
  "CategoriaId": 1,
  "CategoriaNombre": "Comida",
  "Descripcion": "Supermercado"
}
```

`CategoriaId`, `CategoriaNombre` y `Descripcion` pueden ser `null`.

#### Reglas de validación (POST y PUT)

| Campo | Obligatorio | Regla |
|---|---|---|
| `Tipo` | Sí | `"Ingreso"` o `"Egreso"`, sin distinguir mayúsculas. Se guarda con la primera letra en mayúscula. |
| `Monto` | Sí | Mayor que 0, hasta 2 decimales y menor que 100,000,000 (`decimal(10,2)`). |
| `Fecha` | Sí | Formato `YYYY-MM-DD` y fecha real (el 31 de febrero se rechaza), desde el año 1753. |
| `CategoriaId` | No | Si se envía, debe existir en `Categorias`. `null` o `""` significan "sin categoría". |
| `Descripcion` | No | Texto de hasta 200 caracteres. Se recortan los espacios; si queda vacío se guarda `null`. |

Mensajes de error de validación (todos con `400`):

- `Tipo debe ser 'Ingreso' o 'Egreso'`
- `Monto debe ser un número mayor que 0, con hasta 2 decimales y menor que 100,000,000`
- `Fecha debe ser una fecha válida con formato YYYY-MM-DD`
- `CategoriaId no corresponde a ninguna categoría`
- `Descripcion debe ser texto`
- `Descripcion no puede superar 200 caracteres`

#### `GET /api/transacciones`

Lista las transacciones del usuario, de la más reciente a la más antigua (`Fecha` y luego `Id`, descendente), con un resumen de totales.

- **Token:** sí.
- **Query params (todos opcionales y combinables):**

| Parámetro | Regla | Ejemplo |
|---|---|---|
| `tipo` | `Ingreso` o `Egreso` (sin distinguir mayúsculas) | `?tipo=egreso` |
| `mes` | Entero de 1 a 12 | `?mes=11` |
| `anio` | Entero de 1753 a 9999 | `?anio=2026` |
| `categoriaId` | Entero positivo | `?categoriaId=1` |

Ejemplo: `GET /api/transacciones?mes=11&anio=2026`

**`200 OK`**

```json
{
  "transacciones": [
    { "Id": 6, "Tipo": "Egreso", "Monto": 200.25, "Fecha": "2026-11-05", "CategoriaId": 2, "CategoriaNombre": "Transporte", "Descripcion": null },
    { "Id": 5, "Tipo": "Ingreso", "Monto": 1500.5, "Fecha": "2026-11-01", "CategoriaId": null, "CategoriaNombre": null, "Descripcion": "Beca" }
  ],
  "resumen": {
    "totalIngresos": 1500.5,
    "totalEgresos": 200.25,
    "saldo": 1300.25
  }
}
```

El `resumen` aplica los **mismos filtros** que la lista. Si no hay transacciones, la lista viene vacía y los totales en `0`.

| Código | Cuándo | Mensaje |
|---|---|---|
| `400` | `tipo` inválido | `El filtro tipo debe ser 'Ingreso' o 'Egreso'` |
| `400` | `mes` fuera de rango | `El filtro mes debe estar entre 1 y 12` |
| `400` | `anio` inválido | `El filtro anio no es válido` |
| `400` | `categoriaId` inválido | `El filtro categoriaId no es válido` |
| `401` | Sin token o token no válido | — |

#### `POST /api/transacciones`

- **Token:** sí.
- **Body:**

```json
{
  "Tipo": "Egreso",
  "Monto": 120.50,
  "Fecha": "2026-11-03",
  "CategoriaId": 1,
  "Descripcion": "Supermercado"
}
```

**`201 Created`**

```json
{ "transaccion": { "Id": 5, "Tipo": "Egreso", "Monto": 120.5, "Fecha": "2026-11-03", "CategoriaId": 1, "CategoriaNombre": "Comida", "Descripcion": "Supermercado" } }
```

| Código | Cuándo |
|---|---|
| `400` | Algún campo no cumple las [reglas de validación](#reglas-de-validación-post-y-put) |
| `401` | Sin token o token no válido |

#### `PUT /api/transacciones/:id`

Actualización **parcial**: solo cambian los campos enviados y el resto conserva su valor. Para quitar la categoría o la descripción, envía `null`. El resultado final se valida con las mismas reglas que el POST.

- **Token:** sí.
- **Body** (al menos uno de `Tipo`, `Monto`, `Fecha`, `CategoriaId`, `Descripcion`):

```json
{ "Monto": 135.00, "CategoriaId": null }
```

**`200 OK`**: `{ "transaccion": { ... } }` con los valores actualizados.

| Código | Cuándo | Mensaje |
|---|---|---|
| `400` | `:id` no es un entero positivo | `Id de transacción no válido` |
| `400` | El body no trae ningún campo editable | `Envía al menos uno de: Tipo, Monto, Fecha, CategoriaId, Descripcion` |
| `400` | Algún valor no es válido | Ver reglas de validación |
| `401` | Sin token o token no válido | — |
| `404` | No existe **o pertenece a otro usuario** | `Transacción no encontrada` |

#### `DELETE /api/transacciones/:id`

- **Token:** sí.

| Código | Cuándo | Mensaje |
|---|---|---|
| `204` | Eliminada (sin cuerpo) | — |
| `400` | `:id` no es un entero positivo | `Id de transacción no válido` |
| `401` | Sin token o token no válido | — |
| `404` | No existe **o pertenece a otro usuario** | `Transacción no encontrada` |

---

### 6.5 Presupuestos — `/api/presupuestos`

Todas las rutas requieren token y operan **solo sobre los presupuestos del usuario autenticado**.

#### Objeto `presupuesto`

```json
{
  "Id": 1,
  "CategoriaId": 1,
  "CategoriaNombre": "Comida",
  "MontoLimite": 300,
  "Mes": 11,
  "Anio": 2026,
  "gastado": 200,
  "disponible": 100,
  "porcentajeUsado": 66.67,
  "excedido": false
}
```

Campos calculados en SQL:

| Campo | Cálculo |
|---|---|
| `gastado` | Suma de `Monto` de las transacciones del **mismo usuario** con `Tipo = 'Egreso'`, la **misma categoría**, `MONTH(Fecha) = Mes` y `YEAR(Fecha) = Anio`. Vale `0` si no hay gastos. |
| `disponible` | `MontoLimite - gastado`. Es negativo si se superó el límite. |
| `porcentajeUsado` | `gastado * 100 / MontoLimite`, redondeado a 2 decimales. Puede pasar de 100. |
| `excedido` | `true` si `gastado > MontoLimite`; `false` en caso contrario, incluido cuando son iguales. |

Los ingresos, las transacciones sin categoría y los gastos de otros meses, años o usuarios **no** cuentan.

#### `GET /api/presupuestos`

Lista los presupuestos del usuario ordenados por `Anio` y `Mes` descendentes y, dentro del mismo mes, por nombre de categoría.

- **Token:** sí.
- **Query params (opcionales):**

| Parámetro | Regla | Ejemplo |
|---|---|---|
| `mes` | Entero de 1 a 12 | `?mes=11` |
| `anio` | Entero de 2020 a 2100 | `?anio=2026` |

**`200 OK`**

```json
{
  "presupuestos": [
    { "Id": 2, "CategoriaId": 4, "CategoriaNombre": "Ocio", "MontoLimite": 50, "Mes": 11, "Anio": 2026, "gastado": 55, "disponible": -5, "porcentajeUsado": 110, "excedido": true },
    { "Id": 1, "CategoriaId": 1, "CategoriaNombre": "Comida", "MontoLimite": 300, "Mes": 11, "Anio": 2026, "gastado": 200, "disponible": 100, "porcentajeUsado": 66.67, "excedido": false }
  ]
}
```

| Código | Cuándo | Mensaje |
|---|---|---|
| `400` | `mes` fuera de rango | `El filtro mes debe estar entre 1 y 12` |
| `400` | `anio` fuera de rango | `El filtro anio debe estar entre 2020 y 2100` |
| `401` | Sin token o token no válido | — |

#### `POST /api/presupuestos`

Configura el presupuesto mensual de una categoría.

- **Token:** sí.
- **Body:**

```json
{
  "CategoriaId": 1,
  "MontoLimite": 300.00,
  "Mes": 11,
  "Anio": 2026
}
```

| Campo | Regla |
|---|---|
| `CategoriaId` | Obligatorio; debe existir en `Categorias`. |
| `MontoLimite` | Mayor que 0, hasta 2 decimales y menor que 100,000,000. |
| `Mes` | Entero de 1 a 12. |
| `Anio` | Entero de 2020 a 2100. |

Solo puede haber **un presupuesto por usuario, categoría, mes y año**. Otros usuarios sí pueden tener un presupuesto para la misma combinación.

**`201 Created`**: `{ "presupuesto": { ... } }` con los campos calculados.

| Código | Cuándo | Mensaje |
|---|---|---|
| `400` | Categoría inexistente o ausente | `CategoriaId no corresponde a ninguna categoría` |
| `400` | `MontoLimite` inválido | `MontoLimite debe ser un número mayor que 0, con hasta 2 decimales y menor que 100,000,000` |
| `400` | `Mes` inválido | `Mes debe ser un entero entre 1 y 12` |
| `400` | `Anio` inválido | `Anio debe ser un entero entre 2020 y 2100` |
| `401` | Sin token o token no válido | — |
| `409` | Ya existe un presupuesto para esa categoría, mes y año | `Ya existe un presupuesto para esa categoría en ese mes y año` |

#### `PUT /api/presupuestos/:id`

Cambia el límite de un presupuesto. **Solo se puede modificar `MontoLimite`**; cualquier otro campo del body se ignora. Para cambiar de categoría o de periodo, elimina el presupuesto y crea uno nuevo.

- **Token:** sí.
- **Body:**

```json
{ "MontoLimite": 450.00 }
```

**`200 OK`**: `{ "presupuesto": { ... } }` con `disponible`, `porcentajeUsado` y `excedido` recalculados.

| Código | Cuándo | Mensaje |
|---|---|---|
| `400` | `:id` no es un entero positivo | `Id de presupuesto no válido` |
| `400` | `MontoLimite` ausente o inválido | `MontoLimite debe ser un número mayor que 0, con hasta 2 decimales y menor que 100,000,000` |
| `401` | Sin token o token no válido | — |
| `404` | No existe **o pertenece a otro usuario** | `Presupuesto no encontrado` |

#### `DELETE /api/presupuestos/:id`

- **Token:** sí.

| Código | Cuándo | Mensaje |
|---|---|---|
| `204` | Eliminado (sin cuerpo) | — |
| `400` | `:id` no es un entero positivo | `Id de presupuesto no válido` |
| `401` | Sin token o token no válido | — |
| `404` | No existe **o pertenece a otro usuario** | `Presupuesto no encontrado` |

---

## 7. Limitaciones conocidas

| Limitación | Efecto | Posible solución |
|---|---|---|
| El registro no limita la longitud del correo a 150 caracteres (el tamaño de `Usuarios.Correo`). | Un correo de más de 150 caracteres provoca un error de SQL Server y la API responde `500` en lugar de `400`. | Validar la longitud en `authController.register`. |
| `Presupuestos` no tiene índice único ni `CHECK` en la base de datos. | Las reglas solo se aplican en la API; dos peticiones simultáneas idénticas podrían crear un duplicado. | Aplicar el SQL de la sección [2.4](#24-pendiente-opcional-restricciones-en-presupuestos). |
| El rol viaja dentro del JWT. | Un cambio de rol no afecta a los tokens ya emitidos hasta que caducan (8 h por defecto). | Volver a iniciar sesión tras cambiar el rol, o consultar el rol en la base de datos en `verificarRol`. |
| Los listados no tienen paginación. | Con muchos registros, `GET /api/transacciones` devuelve todo de una vez. | Añadir parámetros `pagina`/`limite` con `OFFSET ... FETCH`. |
| No hay endpoints para editar o borrar categorías, ni para administrar usuarios. | Esas tareas se hacen directamente en SQL Server. | Añadir rutas protegidas con `verificarRol('administrador')`. |
| No hay suite de pruebas automatizada en el repositorio. | Las pruebas de la sección 4 no se ejecutan con `npm test`. | Incorporar los scripts de prueba usando `node --test`. |
