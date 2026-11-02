<p align="center">
  <img src="./assets/logo.png" alt="FastGCF Logo" width="180">
</p>

<h1 align="center">FastGCF</h1>

<p align="center">
  <strong>CLI en TypeScript para crear APIs HTTP en Google Cloud Run y Cloud Functions con Zod, OpenAPI y Swagger</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@crescar/fastgcf"><img src="https://img.shields.io/npm/v/fastgcf.svg?style=flat-square&color=blue" alt="Versión npm"></a>
  <a href="https://www.npmjs.com/package/@crescar/fastgcf"><img src="https://img.shields.io/npm/dm/fastgcf.svg?style=flat-square&color=brightgreen" alt="Descargas npm"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-%3E%3D20.x-green.svg?style=flat-square" alt="Versión Node"></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg?style=flat-square" alt="TypeScript"></a>
  <a href="https://cloud.google.com/functions"><img src="https://img.shields.io/badge/Google%20Cloud-Cloud%20Run%20%7C%20Functions-4285F4.svg?style=flat-square&logo=google-cloud&logoColor=white" alt="Google Cloud"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/licencia-MIT-blue.svg?style=flat-square" alt="Licencia"></a>
</p>

<p align="center">
  🌐 <strong>Language / Idioma:</strong> <a href="./README.md">English</a> | <strong>Español</strong>
</p>

---

**FastGCF es una herramienta de línea de comandos para Node.js que genera, compila, documenta y ejecuta APIs HTTP multifunción para Google Cloud Platform (Cloud Run / Cloud Functions).** Con un solo comando creas una función tipada en TypeScript con validación Zod, su prueba unitaria, su entrada OpenAPI 3.0 y el registro de su ruta. Todo se sirve desde un único servicio Express listo para empaquetar en un contenedor y desplegar.

> **En resumen:** `fastgcf new mi-api` → `fastgcf function usuarios --method POST --path v1/usuarios` → `fastgcf start` → abre `http://localhost:3000/docs`.

---

## ¿Por qué FastGCF?

Crear una API HTTP en GCP suele implicar repetir el mismo código base en cada endpoint: rutas de Express, validación, manejo de errores, formato de respuesta, documentación OpenAPI, pruebas y configuración de build y despliegue. FastGCF lo genera por ti, siempre con la misma estructura.

| Tarea | Configuración manual | Con FastGCF |
| --- | --- | --- |
| Proyecto nuevo (runner Express, TypeScript, Jest, Zod, OpenAPI, Dockerfile) | Configurar cada herramienta a mano | `fastgcf new <nombre>` |
| Endpoint nuevo (handler + esquemas Zod + servicio + test + ruta + docs) | Más de 4 archivos y 2 registros editados a mano | `fastgcf function <nombre>` |
| Middleware reutilizable (auth, logging, rate limit) asociado a endpoints | Conectar imports y rutas a mano | `fastgcf prehandler <nombre> --functions a,b` |
| Especificación OpenAPI 3.0 + Swagger UI | Escribir y mantener YAML/JSON a mano | Se genera desde tus esquemas Zod en cada build |
| Eliminar un endpoint limpiamente | Borrar código, build, ruta y docs a mano | `fastgcf drop <nombre> --yes` |

### Qué genera `fastgcf function <nombre>`

```text
src/functions/<nombre>/index.ts                # handlerResponse(...) con ruta, preHandlers, validadores y metadatos de docs
src/functions/<nombre>/schemas/index.ts        # Esquemas Zod de request, respuesta y errores con ejemplos
src/functions/<nombre>/services/index.ts       # Lógica de negocio (normalmente el único archivo que editas)
src/functions/<nombre>/__tests__/index.spec.ts # Prueba unitaria con Jest
src/docs/functions/<nombre>.ts                 # Extractor de la ruta OpenAPI
fastgcf.json                                   # Ruta registrada: handler, path, methods, preHandlers
src/docs/index.ts                              # Función añadida al documento OpenAPI
```

---

## Cuándo usar FastGCF

**Úsalo cuando necesites:**

- Una API REST/HTTP para **Google Cloud Run** o **Cloud Functions** escrita en **TypeScript** sobre **Node.js**.
- **Muchos endpoints en un solo servicio desplegable** (un contenedor, una URL, muchas rutas).
- Validación con **Zod** y documentación **OpenAPI 3.0 / Swagger UI generada automáticamente**.
- Middlewares de Express reutilizables (**preHandlers**) para autenticación, logging o rate limiting.
- Una estructura de proyecto consistente y predecible, que tanto personas como agentes de IA puedan extender con seguridad.

**No es la mejor opción para:**

- Funciones disparadas por eventos (Pub/Sub, Cloud Storage, triggers de Firestore). FastGCF está pensado para HTTP.
- Desplegar una Cloud Function separada por cada endpoint (FastGCF agrupa todas las rutas en un servicio).
- AWS Lambda: para eso usa el proyecto hermano [FastLBS](https://github.com/crescar/fastlbs_CLI).

---

## Instalación

Requisitos: **Node.js 20+** y npm.

```bash
npm install -g fastgcf
```

Desde el código fuente:

```bash
git clone <url-del-repositorio> fastgcf
cd fastgcf
npm install
npm link        # deja disponible el comando `fastgcf` de forma global
```

---

## Uso rápido

```bash
# 1. Crear el proyecto (instala dependencias y ejecuta git init)
fastgcf new mi-api-gcp
cd mi-api-gcp

# 2. Crear endpoints
fastgcf function saludo   --method GET  --path v1/saludo
fastgcf function usuarios --method POST --path v1/usuarios

# 3. Crear un preHandler de autenticación y asociarlo a "usuarios"
fastgcf prehandler auth --functions usuarios

# 4. Compilar y levantar en modo desarrollo
fastgcf start
```

| URL | Qué sirve |
| --- | --- |
| `http://localhost:3000/v1/saludo` | Tu función |
| `http://localhost:3000/docs` o `/api/doc` | Swagger UI |
| `http://localhost:3000/openapi.json` o `/api/doc/json` | Especificación OpenAPI 3.0 |
| `http://localhost:3000/health` | Health check |

---

## Comandos

| Comando | Alias | Descripción | Opciones clave |
| --- | --- | --- | --- |
| `fastgcf new <project-name>` | `init` | Crea un proyecto: runner Express (`index.js`, `util.js`), `fastgcf.json`, `libs/common`, TypeScript, Jest y `Dockerfile` | `--skip-install` |
| `fastgcf function <name>` | `create-function` | Crea una función con esquemas Zod, servicio, test, ruta y docs | `-m, --method <METODO>`, `-p, --path <ruta>`, `--prehandler <a,b>` |
| `fastgcf prehandler <name>` | `create-prehandler` | Crea un preHandler de Express y lo inyecta en las funciones elegidas | `-f, --functions <a,b>` |
| `fastgcf build [name]` | `compile` | Compila una o todas las funciones, los preHandlers y la especificación OpenAPI en `dist/` con esbuild | `-t, --type bundle\|modular` |
| `fastgcf start [name]` | `dev` | Compila y levanta el servidor Express con recarga automática (nodemon) | — |
| `fastgcf docs` | `openapi` | Regenera `dist/openapi.json` a partir de los esquemas Zod | — |
| `fastgcf list` | `ls` | Muestra funciones, métodos, rutas y preHandlers | `--json` |
| `fastgcf test [name]` | `spec` | Ejecuta Jest para una función o para todo el proyecto | — |
| `fastgcf drop <name>` | `remove` | Elimina el código, el build, las docs y la ruta de una función | `-y, --yes` |

Ejecuta `fastgcf <comando> --help` para ver ejemplos.

---

## Uso de FastGCF con agentes de IA

FastGCF funciona bien con asistentes de programación con IA (Claude, Gemini, ChatGPT, Copilot, Cursor y similares) porque cada comando es **determinista, basado en archivos y ejecutable sin preguntas interactivas**. En lugar de escribir a mano rutas, validadores y archivos OpenAPI, el agente ejecuta un comando y luego edita solo la lógica de negocio.

### Comandos no interactivos (sin prompts)

```bash
fastgcf new mi-api --skip-install                                     # scaffold sin npm install
fastgcf function obtener-usuario --method GET --path "v1/usuarios/{id}" # los path params se vuelven esquemas Zod
fastgcf function crear-usuario --method POST --path v1/usuarios --prehandler auth
fastgcf prehandler rate-limit --functions obtener-usuario,crear-usuario
fastgcf build --type bundle                                           # compila todo + OpenAPI
fastgcf list --json                                                   # inventario de rutas legible por máquinas
fastgcf drop obtener-usuario --yes                                    # elimina sin confirmación
```

### Flujo recomendado para agentes

1. Ejecuta `fastgcf list --json` para ver las rutas existentes.
2. Crea el endpoint con `fastgcf function <nombre> --method <M> --path <p>`.
3. Edita **solo** estos archivos:
   - `src/functions/<nombre>/schemas/index.ts`: esquemas Zod de entrada y salida.
   - `src/functions/<nombre>/services/index.ts`: lógica de negocio.
4. Ejecuta `fastgcf build --type bundle` y `fastgcf test <nombre>`.
5. Revisa `dist/openapi.json` para confirmar el contrato.

### Reglas para agentes

- **No** edites a mano `fastgcf.json`, `src/docs/**` ni `dist/**`. El CLI los genera y sincroniza.
- Los nombres de funciones y preHandlers solo admiten letras, números, `_` y `-`.
- Las rutas se guardan sin barra inicial (`v1/usuarios`). Usa `{param}` para parámetros de ruta.
- Cada combinación de ruta y método debe ser única. Los conflictos fallan con `[DUPLICATE_ROUTE_PATH]`.
- Los errores se muestran como `[CODIGO_ERROR] mensaje` más una línea `Hint:`, así que son fáciles de interpretar.

---

## Ejemplo de función generada

```ts
// src/functions/usuarios/index.ts (generado)
import { handlerResponse } from "@mi-api-gcp/common/wrappers/handlerResponse.wrapper";
import { validatorMiddleware, ValidationOptions } from "@mi-api-gcp/common/middlewares/validator.middleware";
import { RequestBodySchema, GreetingResponseSchema, BadRequestErrorSchema, InternalServerErrorSchema } from "./schemas";
import { service } from "./services";
import preHandler from "../../preHandlers/preHandler";
import auth from "../../preHandlers/auth";

export const handler = handlerResponse(
    {
        event: {
            method: "POST",
            path: "v1/usuarios",
            preHandlers: ["dist/preHandlers/preHandler.js", "dist/preHandlers/auth.js"],
        },
        preHandlers: [preHandler, auth],
        doc: {
            summary: "Basic usuarios function",
            tags: ["USUARIOS"],
            response: GreetingResponseSchema,
            errors: {
                400: { description: "Bad Request / Validation Error", schema: BadRequestErrorSchema },
                500: { description: "Internal Server Error", schema: InternalServerErrorSchema },
            },
        },
    },
    validatorMiddleware(RequestBodySchema, ValidationOptions.BODY),
    service
);

export default handler;
```

Respuesta exitosa estándar:

```json
{ "status": "success", "message": "Request successful", "data": { "greeting": "Hello, Ana! from function usuarios" } }
```

Los errores de validación devuelven `400` con `{ "message": "Invalid request", "error": ["name: ..."] }`, sin que tengas que escribir código adicional.

---

## Estructura del proyecto

```text
mi-api-gcp/
├── index.js                 # Runner Express multifunción (monta las rutas de fastgcf.json)
├── util.js                  # Normalización de rutas, validación de duplicados y log de rutas
├── fastgcf.json             # Registro de funciones: name, handler, path, methods, preHandlers
├── Dockerfile               # Imagen lista para Cloud Run (escucha en PORT, 8080 por defecto)
├── libs/common/             # Contexto tipado, wrapper handlerResponse, validador Zod y utilidades OpenAPI
├── src/
│   ├── functions/<nombre>/  # index.ts, schemas/, services/, __tests__/
│   ├── preHandlers/         # Middlewares de Express (req, res, next)
│   └── docs/                # Agregador OpenAPI 3.0 (gestionado automáticamente)
└── dist/                    # Salida ESM de esbuild + openapi.json
```

### `fastgcf.json`

```json
{
    "service": "mi-api-gcp",
    "functions": [
        {
            "name": "usuarios",
            "handler": "dist/usuarios/index.js",
            "path": "v1/usuarios",
            "methods": ["POST"],
            "preHandlers": ["dist/preHandlers/preHandler.js", "dist/preHandlers/auth.js"]
        }
    ]
}
```

---

## Despliegue en Google Cloud Run

El `Dockerfile` generado ejecuta `node index.js` y lee la variable `PORT`, que es lo que espera Cloud Run.

```bash
fastgcf build --type bundle
gcloud run deploy mi-api-gcp --source . --region us-central1 --allow-unauthenticated
```

> **Nota:** `dist/` está en `.gitignore`. Si despliegas con `--source`, crea un `.gcloudignore` que **no** excluya `dist/` (por ejemplo, uno que solo excluya `node_modules/` y `.env`). Si no, las funciones compiladas no se suben. Está previsto un comando `fastgcf deploy`.

---

## Preguntas frecuentes

**¿FastGCF despliega una Cloud Function por cada endpoint?**
No. Todos los endpoints corren dentro de un único servicio Express que despliegas como un solo servicio de Cloud Run (o como una sola Cloud Function HTTP). Eso significa menos arranques en frío, una URL y un único despliegue.

**¿Cómo se genera la documentación OpenAPI / Swagger?**
En cada `fastgcf build`, `fastgcf start` o `fastgcf docs`, el CLI lee los validadores Zod y los metadatos `doc` de cada función y los convierte a OpenAPI 3.0 con `@asteasolutions/zod-to-openapi`. Swagger UI se sirve en `/docs`.

**¿Qué es un preHandler?**
Un middleware estándar de Express `(req, res, next)` que se ejecuta antes de la función. Se usa típicamente para autenticación, logging y rate limiting. Las funciones con un preHandler `auth` reciben automáticamente seguridad `BearerAuth`/`BasicAuth` y una respuesta `401` en la especificación OpenAPI.

**¿Puedo usar parámetros de ruta?**
Sí. Usa `--path "v1/usuarios/{id}"`. FastGCF lo convierte en `:id` de Express, genera un esquema Zod para los params y lo documenta en OpenAPI.

**¿Qué modo de build debo usar?**
`bundle` (por defecto) incluye las dependencias en un único archivo por función. `modular` deja los paquetes npm como externos y genera un `package.json` mínimo junto a la salida.

**¿Existe una versión para AWS Lambda?**
Sí: [FastLBS](https://github.com/crescar/fastlbs_CLI) aplica las mismas ideas sobre Serverless Framework.

---

## Stack tecnológico

Node.js · TypeScript · Express 5 · Zod · @asteasolutions/zod-to-openapi · Swagger UI · esbuild · Jest · nodemon · Commander · Docker · Google Cloud Run · Google Cloud Functions

## Palabras clave (SEO / GEO)

`gcp`, `google-cloud-platform`, `google-cloud-functions`, `cloud-run`, `cloud-run-api`, `gcp-cli`, `gcp-functions-generator`, `express`, `express-5`, `typescript`, `zod`, `zod-to-openapi`, `openapi`, `openapi-3`, `swagger`, `swagger-ui`, `esbuild`, `prehandlers`, `middleware`, `rest-api`, `http-functions`, `serverless-gcp`, `microservices`, `cloud-native`, `nodejs`, `cli`, `scaffold`, `boilerplate`, `code-generator`, `ai-agent-friendly`, `llm-friendly`

## Autor y Licencia

- **Autor:** Luis Crespo
- **Email:** [crescar64@gmail.com](mailto:crescar64@gmail.com)
- **Licencia:** [MIT](LICENSE)
