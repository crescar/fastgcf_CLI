import fs from 'fs';
import path from 'path';

export function createBaseRuntime(projectName, baseDir = process.cwd()) {
    const utilContent = `export function normalizeRoutePath(rawPath) {
    const trimmed = String(rawPath ?? '').trim();
    if (!trimmed) {
        throw new Error('Function path cannot be empty');
    }
    const withoutSlashes = trimmed.replace(/^\\/+/, '').replace(/\\/+$/, '');
    if (!withoutSlashes) {
        return '/';
    }
    // Convert OpenAPI {param} syntax to Express :param syntax for routing
    const expressSegments = withoutSlashes.replace(/\\{([^}]+)\\}/g, ':$1');
    return '/' + expressSegments;
}

export function validateNotRepeatedPaths(functions) {
    if (!Array.isArray(functions)) {
        throw new Error('fastgcf.json "functions" property must be an array');
    }
    const routeKeys = new Set();
    for (const func of functions) {
        if (!func || typeof func.path !== 'string' || !func.path.trim()) {
            throw new Error('Each function in fastgcf.json must define a valid "path" string');
        }
        const normalizedPath = normalizeRoutePath(func.path);
        const methods = Array.isArray(func.methods) && func.methods.length > 0
            ? func.methods.map((m) => String(m).toUpperCase())
            : ['ALL'];

        for (const method of methods) {
            const key = \`\${method}:\${normalizedPath}\`;
            const wildcardKey = \`ALL:\${normalizedPath}\`;
            if (routeKeys.has(key) || routeKeys.has(wildcardKey) || (method === 'ALL' && [...routeKeys].some((k) => k.endsWith(\`:\${normalizedPath}\`)))) {
                throw new Error(\`Duplicate path found: \${func.path}\`);
            }
            routeKeys.add(key);
        }
    }
}

export function logAllPaths(functions, port = process.env.PORT || 3000) {
    const baseUrl = 'http://localhost:' + port;
    console.log('All paths:');
    for (const func of functions) {
        const cleanPath = String(func.path).replace(/^\\/+/, '');
        const methodsLabel = Array.isArray(func.methods) && func.methods.length > 0
            ? \`[\${func.methods.map((m) => String(m).toUpperCase()).join(', ')}] \`
            : '[ALL] ';
        console.log(\`  \${methodsLabel}\${baseUrl}/\${cleanPath}\`);
    }
    console.log(\`  [DOCS] \${baseUrl}/docs\`);
    console.log(\`  [DOCS] \${baseUrl}/api/doc\`);
    console.log(\`  [JSON] \${baseUrl}/openapi.json\`);
}

export function detectIfRouterStartsWithSlash(functions) {
    for (const func of functions) {
        if (!func.path || typeof func.path !== 'string') {
            throw new Error('Each function must have a valid path');
        }
    }
}
`;

    const indexContent = `import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { validateNotRepeatedPaths, logAllPaths, normalizeRoutePath } from './util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SWAGGER_HTML = \`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>FastGCF API Docs</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>\`;

export async function createApp(customConfig = null) {
    const configPath = path.join(__dirname, 'fastgcf.json');
    const fastgcf = customConfig ?? JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const { functions = [] } = fastgcf;

    validateNotRepeatedPaths(functions);

    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.get('/health', (_req, res) => {
        res.status(200).json({ status: 'ok', service: fastgcf.service || 'fastgcf' });
    });

    const loadOpenApiSpec = async () => {
        const openApiJsonPath = path.join(__dirname, 'dist', 'openapi.json');
        if (fs.existsSync(openApiJsonPath)) {
            return JSON.parse(fs.readFileSync(openApiJsonPath, 'utf-8'));
        }
        const compiledDocModule = path.join(__dirname, 'dist', '__doc__', 'index.js');
        if (fs.existsSync(compiledDocModule)) {
            const mod = await import(\`./dist/__doc__/index.js?t=\${Date.now()}\`);
            return mod.default ?? mod;
        }
        return {
            openapi: '3.0.0',
            info: {
                title: fastgcf.service || 'FastGCF API Documentation',
                version: '1.0.0',
            },
            paths: {},
        };
    };

    app.get('/openapi.json', async (_req, res) => {
        const spec = await loadOpenApiSpec();
        res.status(200).json(spec);
    });

    app.get('/api/doc/json', async (_req, res) => {
        const spec = await loadOpenApiSpec();
        res.status(200).json(spec);
    });

    app.get('/docs', (_req, res) => {
        res.status(200).type('html').send(SWAGGER_HTML);
    });

    app.get('/api/doc', (_req, res) => {
        res.status(200).type('html').send(SWAGGER_HTML);
    });

    for (const func of functions) {
        const handlerMod = await import(\`./\${func.handler}\`);
        const handler = handlerMod.default ?? handlerMod.handler;
        const preHandlers = [];
        if (Array.isArray(func.preHandlers)) {
            for (const preHandlerPath of func.preHandlers) {
                const preMod = await import(\`./\${preHandlerPath}\`);
                const preHandler = preMod.default ?? preMod.preHandler;
                if (typeof preHandler === 'function') {
                    preHandlers.push((req, res, next) => {
                        req.__fastgcfPreHandlersExecuted = true;
                        return preHandler(req, res, next);
                    });
                }
            }
        }

        const routePath = normalizeRoutePath(func.path);
        const methods = Array.isArray(func.methods) && func.methods.length > 0
            ? func.methods.map((m) => String(m).toLowerCase())
            : ['all'];

        for (const method of methods) {
            if (method === 'all' || typeof app[method] !== 'function') {
                app.all(routePath, ...preHandlers, handler);
            } else {
                app[method](routePath, ...preHandlers, handler);
            }
        }
    }

    return { app, functions };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
    const { app, functions } = await createApp();
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(\`Server running at http://localhost:\${port}\`);
        logAllPaths(functions, port);
    });
}
`;

    const projectDir = path.join(baseDir, projectName);
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'util.js'), utilContent, 'utf-8');
    fs.writeFileSync(path.join(projectDir, 'index.js'), indexContent, 'utf-8');
}
