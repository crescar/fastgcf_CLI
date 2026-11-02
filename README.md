<p align="center">
  <img src="./assets/logo.png" alt="FastGCF Logo" width="180">
</p>

<h1 align="center">FastGCF</h1>

<p align="center">
  <strong>TypeScript CLI to scaffold Google Cloud Run & Cloud Functions HTTP APIs with Zod, OpenAPI and Swagger</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@crescar/fastgcf"><img src="https://img.shields.io/npm/v/fastgcf.svg?style=flat-square&color=blue" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@crescar/fastgcf"><img src="https://img.shields.io/npm/dm/fastgcf.svg?style=flat-square&color=brightgreen" alt="npm downloads"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-%3E%3D20.x-green.svg?style=flat-square" alt="Node version"></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg?style=flat-square" alt="TypeScript"></a>
  <a href="https://cloud.google.com/functions"><img src="https://img.shields.io/badge/Google%20Cloud-Cloud%20Run%20%7C%20Functions-4285F4.svg?style=flat-square&logo=google-cloud&logoColor=white" alt="Google Cloud"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="license"></a>
</p>

<p align="center">
  🌐 <strong>Language / Idioma:</strong> <strong>English</strong> | <a href="./README.es.md">Español</a>
</p>

---

**FastGCF is a Node.js command-line tool that generates, builds, documents and runs multi-function HTTP APIs for Google Cloud Platform (Cloud Run / Cloud Functions).** One command creates a typed TypeScript function with Zod validation, a unit test, an OpenAPI 3.0 entry and its route registration — all served from a single Express service that is ready to containerize and deploy.

> **TL;DR:** `fastgcf new my-api` → `fastgcf function users --method POST --path v1/users` → `fastgcf start` → open `http://localhost:3000/docs`.

---

## Why FastGCF?

Building an HTTP API on GCP usually means writing the same boilerplate for every endpoint: Express routing, request validation, error handling, response shape, OpenAPI docs, tests and the build/deploy setup. FastGCF generates all of it for you, consistently.

| Task | Manual setup | With FastGCF |
| --- | --- | --- |
| New project (Express runner, TypeScript, Jest, Zod, OpenAPI, Dockerfile) | Configure each tool by hand | `fastgcf new <name>` |
| New endpoint (handler + Zod schemas + service + test + route + docs) | 4+ files and 2 registries edited by hand | `fastgcf function <name>` |
| Reusable middleware (auth, logging, rate limit) attached to endpoints | Wire imports and routes by hand | `fastgcf prehandler <name> --functions a,b` |
| OpenAPI 3.0 spec + Swagger UI | Write and maintain YAML/JSON by hand | Generated from your Zod schemas on every build |
| Remove an endpoint cleanly | Delete source, build output, route and docs by hand | `fastgcf drop <name> --yes` |

### What `fastgcf function <name>` generates

```text
src/functions/<name>/index.ts               # handlerResponse(...) with route, preHandlers, validators and doc metadata
src/functions/<name>/schemas/index.ts       # Zod request/response/error schemas with examples
src/functions/<name>/services/index.ts      # Business logic (the only file you normally edit)
src/functions/<name>/__tests__/index.spec.ts # Jest unit test
src/docs/functions/<name>.ts                # OpenAPI path extractor
fastgcf.json                                # Route registered: handler, path, methods, preHandlers
src/docs/index.ts                           # Function added to the OpenAPI document
```

---

## When to use FastGCF

**Use it when you need:**

- A REST/HTTP API for **Google Cloud Run** or **Cloud Functions** written in **TypeScript** on **Node.js**.
- **Many endpoints in one deployable service** (one container, one URL, many routes).
- Request validation with **Zod** and **auto-generated OpenAPI 3.0 / Swagger UI** documentation.
- Reusable Express middleware (**preHandlers**) for auth, logging or rate limiting.
- A consistent, predictable project layout that both people and AI coding agents can extend safely.

**It is not the right fit for:**

- Event-triggered functions (Pub/Sub, Cloud Storage, Firestore triggers). FastGCF targets HTTP.
- One separate Cloud Function deployment per endpoint (FastGCF bundles all routes into one service).
- AWS Lambda — use the sister project [FastLBS](https://github.com/crescar/fastlbs_CLI) instead.

---

## Installation

Requirements: **Node.js 20+** and npm.

```bash
npm install -g fastgcf
```

From source:

```bash
git clone <repository-url> fastgcf
cd fastgcf
npm install
npm link        # makes the `fastgcf` command available globally
```

---

## Quick Start

```bash
# 1. Create a project (installs dependencies and runs git init)
fastgcf new my-gcp-api
cd my-gcp-api

# 2. Create endpoints
fastgcf function hellow --method GET  --path v1/hellow
fastgcf function users  --method POST --path v1/users

# 3. Create an auth preHandler and attach it to "users"
fastgcf prehandler auth --functions users

# 4. Build and run in watch mode
fastgcf start
```

| URL | What it serves |
| --- | --- |
| `http://localhost:3000/v1/hellow` | Your function |
| `http://localhost:3000/docs` or `/api/doc` | Swagger UI |
| `http://localhost:3000/openapi.json` or `/api/doc/json` | OpenAPI 3.0 spec |
| `http://localhost:3000/health` | Health check |

---

## Commands

| Command | Alias | Description | Key options |
| --- | --- | --- | --- |
| `fastgcf new <project-name>` | `init` | Create a project: Express runner (`index.js`, `util.js`), `fastgcf.json`, `libs/common`, TypeScript, Jest, `Dockerfile` | `--skip-install` |
| `fastgcf function <name>` | `create-function` | Create a function with Zod schemas, service, test, route and docs | `-m, --method <METHOD>`, `-p, --path <path>`, `--prehandler <a,b>` |
| `fastgcf prehandler <name>` | `create-prehandler` | Create an Express preHandler and inject it into the chosen functions | `-f, --functions <a,b>` |
| `fastgcf build [name]` | `compile` | Compile one or all functions, preHandlers and the OpenAPI spec into `dist/` with esbuild | `-t, --type bundle\|modular` |
| `fastgcf start [name]` | `dev` | Build and run the Express server with hot reload (nodemon) | — |
| `fastgcf docs` | `openapi` | Regenerate `dist/openapi.json` from Zod schemas | — |
| `fastgcf list` | `ls` | Show functions, methods, routes and preHandlers | `--json` |
| `fastgcf test [name]` | `spec` | Run Jest for one function or the whole project | — |
| `fastgcf drop <name>` | `remove` | Delete a function's source, build output, docs and route | `-y, --yes` |

Run `fastgcf <command> --help` for examples.

---

## Using FastGCF with AI coding agents

FastGCF works well with AI assistants (Claude, Gemini, ChatGPT, Copilot, Cursor and similar) because every command is **deterministic, file-based and scriptable without prompts**. Instead of hand-writing routes, validators and OpenAPI files, an agent can run one command and then edit only the business logic.

### Non-interactive commands (no TTY prompts)

```bash
fastgcf new my-api --skip-install                                  # scaffold without npm install
fastgcf function get-user --method GET --path "v1/users/{id}"      # path params become Zod params
fastgcf function create-user --method POST --path v1/users --prehandler auth
fastgcf prehandler rate-limit --functions get-user,create-user
fastgcf build --type bundle                                        # build everything + OpenAPI
fastgcf list --json                                                # machine-readable route inventory
fastgcf drop get-user --yes                                        # delete without confirmation
```

### Recommended agent workflow

1. Run `fastgcf list --json` to see the existing routes.
2. Create the endpoint with `fastgcf function <name> --method <M> --path <p>`.
3. Edit **only** these files:
   - `src/functions/<name>/schemas/index.ts` — request and response Zod schemas.
   - `src/functions/<name>/services/index.ts` — business logic.
4. Run `fastgcf build --type bundle` and `fastgcf test <name>`.
5. Check `dist/openapi.json` to confirm the contract.

### Rules for agents

- **Do not** edit `fastgcf.json`, `src/docs/**` or `dist/**` by hand. The CLI generates and syncs them.
- Function and preHandler names may only contain letters, numbers, `_` and `-`.
- Routes are stored without a leading slash (`v1/users`). Use `{param}` for path parameters.
- A route + method pair must be unique. Conflicts fail with `[DUPLICATE_ROUTE_PATH]`.
- Errors print as `[ERROR_CODE] message` plus a `Hint:` line, so failures are easy to parse.

---

## Example generated function

```ts
// src/functions/users/index.ts (generated)
import { handlerResponse } from "@my-gcp-api/common/wrappers/handlerResponse.wrapper";
import { validatorMiddleware, ValidationOptions } from "@my-gcp-api/common/middlewares/validator.middleware";
import { RequestBodySchema, GreetingResponseSchema, BadRequestErrorSchema, InternalServerErrorSchema } from "./schemas";
import { service } from "./services";
import preHandler from "../../preHandlers/preHandler";
import auth from "../../preHandlers/auth";

export const handler = handlerResponse(
    {
        event: {
            method: "POST",
            path: "v1/users",
            preHandlers: ["dist/preHandlers/preHandler.js", "dist/preHandlers/auth.js"],
        },
        preHandlers: [preHandler, auth],
        doc: {
            summary: "Basic users function",
            tags: ["USERS"],
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

Standard success response:

```json
{ "status": "success", "message": "Request successful", "data": { "greeting": "Hello, Ana! from function users" } }
```

Validation errors return `400` with `{ "message": "Invalid request", "error": ["name: ..."] }`, without any extra code from you.

---

## Project structure

```text
my-gcp-api/
├── index.js                 # Express multi-function runner (mounts routes from fastgcf.json)
├── util.js                  # Route normalization, duplicate route validation, route logger
├── fastgcf.json             # Function registry: name, handler, path, methods, preHandlers
├── Dockerfile               # Cloud Run ready image (listens on PORT, default 8080)
├── libs/common/             # Typed context, handlerResponse wrapper, Zod validator, OpenAPI utils
├── src/
│   ├── functions/<name>/    # index.ts, schemas/, services/, __tests__/
│   ├── preHandlers/         # Express middleware (req, res, next)
│   └── docs/                # OpenAPI 3.0 aggregator (auto-managed)
└── dist/                    # esbuild ESM output + openapi.json
```

### `fastgcf.json`

```json
{
    "service": "my-gcp-api",
    "functions": [
        {
            "name": "users",
            "handler": "dist/users/index.js",
            "path": "v1/users",
            "methods": ["POST"],
            "preHandlers": ["dist/preHandlers/preHandler.js", "dist/preHandlers/auth.js"]
        }
    ]
}
```

---

## Deploying to Google Cloud Run

The generated `Dockerfile` runs `node index.js` and reads `PORT`, which is what Cloud Run expects.

```bash
fastgcf build --type bundle
gcloud run deploy my-gcp-api --source . --region us-central1 --allow-unauthenticated
```

> **Note:** `dist/` is listed in `.gitignore`. When you deploy with `--source`, add a `.gcloudignore` that does **not** exclude `dist/` (for example, one that excludes only `node_modules/` and `.env`). Otherwise the compiled functions won't be uploaded. A built-in `fastgcf deploy` command is planned.

---

## FAQ

**Does FastGCF deploy one Cloud Function per endpoint?**
No. All endpoints run inside one Express service that you deploy as a single Cloud Run service (or as a single HTTP Cloud Function). This means fewer cold starts, one URL and one deployment.

**How is the OpenAPI / Swagger documentation generated?**
On every `fastgcf build`, `fastgcf start` or `fastgcf docs`, the CLI reads each function's Zod validators and `doc` metadata and converts them into OpenAPI 3.0 using `@asteasolutions/zod-to-openapi`. Swagger UI is served at `/docs`.

**What is a preHandler?**
A standard Express middleware `(req, res, next)` that runs before a function. Typical uses are authentication, logging and rate limiting. Functions with an `auth` preHandler automatically get `BearerAuth`/`BasicAuth` security and a `401` response in the OpenAPI spec.

**Can I use path parameters?**
Yes. Use `--path "v1/users/{id}"`. FastGCF maps it to Express `:id`, generates a Zod params schema and documents it in OpenAPI.

**Which build mode should I use?**
`bundle` (default) inlines dependencies into one file per function. `modular` keeps npm packages external and writes a minimal `package.json` next to the output.

**Is there an AWS Lambda version?**
Yes: [FastLBS](https://github.com/crescar/fastlbs_CLI) uses the same ideas with Serverless Framework.

---

## Tech stack

Node.js · TypeScript · Express 5 · Zod · @asteasolutions/zod-to-openapi · Swagger UI · esbuild · Jest · nodemon · Commander · Docker · Google Cloud Run · Google Cloud Functions

## Keywords (SEO / GEO)

`gcp`, `google-cloud-platform`, `google-cloud-functions`, `cloud-run`, `cloud-run-api`, `gcp-cli`, `gcp-functions-generator`, `express`, `express-5`, `typescript`, `zod`, `zod-to-openapi`, `openapi`, `openapi-3`, `swagger`, `swagger-ui`, `esbuild`, `prehandlers`, `middleware`, `rest-api`, `http-functions`, `serverless-gcp`, `microservices`, `cloud-native`, `nodejs`, `cli`, `scaffold`, `boilerplate`, `code-generator`, `ai-agent-friendly`, `llm-friendly`

## Author & License

- **Author:** Luis Crespo
- **Email:** [crescar64@gmail.com](mailto:crescar64@gmail.com)
- **License:** [MIT](LICENSE)
