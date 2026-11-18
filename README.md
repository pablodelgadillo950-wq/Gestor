# Gestor

Plataforma de finanzas personales para estudiantes universitarios. Permite registrar ingresos y egresos, clasificarlos por categoría y definir presupuestos mensuales para ver cuánto se ha gastado y cuánto queda disponible.

Este repositorio contiene el **backend**: una API REST con autenticación JWT y control de acceso por roles. La interfaz web se servirá desde la carpeta `public/`.

> La referencia completa de endpoints y los procedimientos aplicados en la base de datos están en [docs/API_Y_PROCEDIMIENTOS.md](docs/API_Y_PROCEDIMIENTOS.md).

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Entorno de ejecución | Node.js (22 o superior) |
| Framework HTTP | Express 5 |
| Base de datos | Microsoft SQL Server, con el driver nativo `mssql` y consultas parametrizadas |
| Autenticación | JSON Web Tokens (`jsonwebtoken`) |
| Contraseñas | `bcryptjs` |
| Otros | `dotenv` (variables de entorno), `cors` |

No se usa ningún ORM: todo el acceso a datos se hace con SQL escrito a mano y parametrizado.

## Estructura del proyecto (MVC)

```
Gestor/
├── index.js                  # Punto de entrada: configura Express, monta rutas y maneja errores
├── src/
│   ├── config/
│   │   └── db.js             # Pool de conexiones a SQL Server leído desde .env
│   ├── models/               # Consultas SQL parametrizadas (una por entidad)
│   ├── controllers/          # Validación de datos, lógica de negocio y respuestas HTTP
│   ├── routes/               # Definición de endpoints y middlewares que aplican
│   └── middlewares/
│       └── authMiddleware.js # verificarToken (JWT) y verificarRol (RBAC)
├── public/                   # Frontend estático (HTML, CSS, JS)
├── docs/                     # Documentación técnica
├── .env.example              # Plantilla de variables de entorno
└── CLAUDE.md                 # Reglas del proyecto y esquema real de la base de datos
```

El flujo de una petición es siempre **ruta → middlewares → controlador → modelo → SQL Server**:

- **Modelos** (`src/models`): solo hablan con la base de datos. Cada función recibe valores ya validados y los envía como parámetros (`@nombre`), nunca concatenados en el SQL.
- **Controladores** (`src/controllers`): validan y normalizan la entrada, aplican reglas de negocio (por ejemplo, que un usuario solo vea sus propios datos) y deciden el código HTTP.
- **Rutas** (`src/routes`): asocian cada método y URL con su controlador y con los middlewares de seguridad que necesita.
- **Middlewares** (`src/middlewares`): verifican el token JWT y el rol antes de llegar al controlador.

## Instalación local

### 1. Requisitos previos

- **Node.js 22 o superior.** El driver `tedious`, que usa `mssql` internamente, exige Node 22. Comprueba tu versión con `node -v`.
- **Microsoft SQL Server** (probado con SQL Server 2022 Developer).
- **Git.**

### 2. Clonar el repositorio e instalar dependencias

```bash
git clone https://github.com/pablodelgadillo950-wq/Gestor.git
```
```bash
cd Gestor
```
```bash
npm install
```

### 3. Preparar SQL Server

1. **Habilita TCP/IP.** Abre *SQL Server Configuration Manager* → *Configuración de red de SQL Server* → *Protocolos de MSSQLSERVER* → activa **TCP/IP**.
2. **Usa el puerto 1433.** En las propiedades de TCP/IP, pestaña *Direcciones IP*, sección *IPAll*, deja `Puertos TCP dinámicos` vacío y pon `1433` en *Puerto TCP*.
3. **Reinicia el servicio** *SQL Server (MSSQLSERVER)* para aplicar los cambios.
4. **Activa la autenticación de SQL Server.** En SSMS: clic derecho en el servidor → *Propiedades* → *Seguridad* → *Modo de autenticación de SQL Server y Windows*. Reinicia el servicio otra vez.
5. **Crea la base de datos `Gestor`** con sus cuatro tablas (`Usuarios`, `Categorias`, `Transacciones`, `Presupuestos`). El esquema exacto, las restricciones y los ajustes aplicados están en [docs/API_Y_PROCEDIMIENTOS.md](docs/API_Y_PROCEDIMIENTOS.md#1-base-de-datos).
6. **Crea un inicio de sesión** (login) de SQL Server con permisos de lectura y escritura sobre `Gestor`. Usarás su usuario y contraseña en el `.env`.

### 4. Configurar las variables de entorno

Copia la plantilla y edita `.env` con tus valores reales:

```bash
cp .env.example .env
```

| Variable | Descripción | Valor por defecto |
|---|---|---|
| `PORT` | Puerto del servidor HTTP | `3000` |
| `DB_SERVER` | Host de SQL Server | — (obligatoria) |
| `DB_PORT` | Puerto TCP de SQL Server | `1433` |
| `DB_DATABASE` | Nombre de la base de datos | — (obligatoria) |
| `DB_USER` | Usuario de SQL Server | — (obligatoria) |
| `DB_PASSWORD` | Contraseña de SQL Server | — (obligatoria) |
| `DB_ENCRYPT` | `true` para conexiones cifradas (p. ej. Azure SQL) | `false` |
| `DB_TRUST_SERVER_CERTIFICATE` | `true` para aceptar certificados autofirmados en local | `true` |
| `JWT_SECRET` | Clave con la que se firman los tokens | — (obligatoria) |
| `JWT_EXPIRES_IN` | Duración de los tokens (`8h`, `1d`, …) | `8h` |
| `BCRYPT_SALT_ROUNDS` | Coste del hash de contraseñas | `10` |
| `CORS_ORIGIN` | Origen permitido para peticiones desde el navegador | `http://localhost:3000` |

> **Importante:** `JWT_SECRET` debe ser una cadena larga y aleatoria. Puedes generar una con
> `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
> El archivo `.env` está en `.gitignore` y **nunca** debe subirse al repositorio.

### 5. Ejecutar el servidor

En desarrollo, con reinicio automático al guardar cambios:

```bash
npm run dev
```

En modo normal:

```bash
npm start
```

El servidor queda disponible en `http://localhost:3000` (o el `PORT` que configures). Para comprobar que se conecta a la base de datos:

```bash
curl http://localhost:3000/api/health
```

Si responde `{"status":"ok","database":"conectada"}`, todo está listo. Si responde `503`, revisa las credenciales del `.env` y que SQL Server acepte conexiones TCP en el puerto indicado.

## Modelo de seguridad

### Autenticación con JWT

1. El usuario se registra (`POST /api/auth/register`) o inicia sesión (`POST /api/auth/login`).
2. La contraseña nunca se guarda en texto plano: se almacena su hash generado con **bcryptjs**.
3. El servidor responde con un **token JWT** firmado con `JWT_SECRET` (algoritmo HS256) que contiene `Id`, `Correo` y `Rol`, y caduca según `JWT_EXPIRES_IN`.
4. El cliente envía ese token en cada petición protegida:
   ```
   Authorization: Bearer <token>
   ```
5. El middleware `verificarToken` valida la firma y la caducidad. Si el token falta, es inválido o expiró, responde `401`.

Otras medidas:

- El login responde lo mismo (`401 Credenciales inválidas`) tanto si el correo no existe como si la contraseña es incorrecta, y tarda lo mismo en ambos casos, para que no se pueda averiguar qué correos están registrados.
- Solo se aceptan tokens HS256; un token sin firma (`alg: none`) o firmado con otra clave se rechaza.
- `PasswordHash` nunca se incluye en las respuestas de la API.

### Control de acceso por roles (RBAC)

Cada usuario tiene un rol en la columna `Usuarios.Rol`:

| Rol | Qué puede hacer |
|---|---|
| `estudiante` | Gestionar sus propias transacciones y presupuestos, y consultar las categorías. |
| `administrador` | Todo lo anterior, y además crear categorías. |

- **Todo registro público crea un `estudiante`.** Aunque el cliente envíe otro rol, se ignora. Para convertir a alguien en administrador hay que cambiar su `Rol` directamente en SQL Server.
- El middleware `verificarRol(...roles)` restringe una ruta a los roles indicados y responde `403` si el usuario no tiene permiso.
- El rol viaja dentro del token: si se cambia el rol de un usuario, el cambio se aplica cuando vuelve a iniciar sesión o cuando su token caduca.

### Aislamiento de datos entre usuarios

Las transacciones y los presupuestos siempre se filtran por el `Id` del usuario que viene en el token (`WHERE UsuarioId = @usuarioId`), nunca por un dato enviado por el cliente. Si alguien intenta leer, modificar o borrar un registro de otro usuario, recibe `404`, exactamente igual que si no existiera.

### Base de datos

- Todas las consultas son **parametrizadas**, lo que impide la inyección SQL.
- Las credenciales y secretos se leen de `.env`; no hay ninguno escrito en el código.
- Los errores internos (`500`) se registran en la consola del servidor, pero al cliente solo se le devuelve un mensaje genérico, sin detalles de la base de datos.
