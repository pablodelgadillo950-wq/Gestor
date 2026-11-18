# Proyecto: Gestor (Finanzas Personales para Estudiantes)

## Stack Tecnológico y Arquitectura
- **Patrón:** Modelo-Vista-Controlador (MVC).
- **Backend:** Node.js con Express (API RESTful).
- **Base de Datos:** Microsoft SQL Server (driver nativo `mssql`, consultas parametrizadas).
- **Autenticación y Seguridad:** JWT (`jsonwebtoken` + `bcryptjs`) y Control de Acceso Basado en Roles (RBAC: `estudiante`, `administrador`).

## Estructura de Carpetas Objetivo
- `/src/config` -> Conexión a SQL Server (`db.js`) y variables de entorno.
- `/src/controllers` -> Lógica de negocio y respuestas HTTP.
- `/src/models` -> Consultas SQL parametrizadas hacia SQL Server.
- `/src/routes` -> Definición de endpoints REST.
- `/src/middlewares` -> Validación de tokens JWT y roles RBAC.
- `/public` -> Interfaz frontend (HTML, CSS, JS).

## Reglas Estrictas
1. **No cambiar el stack:** No instalar ORMs (Prisma, Sequelize) ni cambiar de motor de BD; usar únicamente SQL Server (`mssql`).
2. **Seguridad:** Parametrizar todas las consultas SQL. No exponer credenciales ni secretos en el código; usar `.env`.
3. **Flujo de trabajo:** Explicar el plan antes de crear o editar múltiples archivos y mantener un manejo de errores limpio con `try/catch` y códigos HTTP estándar.