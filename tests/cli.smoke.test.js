import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import {
    nameToKebabCase,
    toPascalCase,
    toDocConstName,
    normalizeRoutePath,
    inferFunctionName,
} from '../src/utils/string_utils.js';
import {
    assertValidFunctionName,
    assertValidProjectName,
    assertValidPreHandlerName,
} from '../src/utils/cli_validation.js';
import { addDocToPathsArray, removeDocFromPaths } from '../src/services/docs/doc_manager.js';
import { normalizeBuildType, extractUsedDependencies } from '../src/scripts/build/index.js';
import { createProject } from '../src/scripts/new_project/index.js';
import { createGcfFunction } from '../src/scripts/create_function/index.js';
import { buildMethodValidationTemplate } from '../src/scripts/create_function/services/create_function.js';
import { generatePreHandler } from '../src/scripts/prehandler/index.js';
import { buildProject } from '../src/scripts/build/index.js';
import { listFunctions } from '../src/scripts/list/index.js';
import { dropGcfFunction } from '../src/scripts/drop_function/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const cliEntry = path.join(repoRoot, 'bin', 'fastgcf.js');
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'));

function runCli(args, options = {}) {
    return spawnSync(process.execPath, [cliEntry, ...args], {
        cwd: repoRoot,
        encoding: 'utf-8',
        ...options,
    });
}

test('CLI prints exact version from package.json', () => {
    const result = runCli(['--version']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), packageJson.version);
});

test('CLI prints help with all registered commands and aliases', () => {
    const result = runCli(['--help']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /new|init/);
    assert.match(result.stdout, /function|create-function/);
    assert.match(result.stdout, /prehandler|create-prehandler/);
    assert.match(result.stdout, /build|compile/);
    assert.match(result.stdout, /start|dev/);
    assert.match(result.stdout, /docs|openapi/);
    assert.match(result.stdout, /list|ls/);
    assert.match(result.stdout, /test|spec/);
    assert.match(result.stdout, /drop|remove/);
});

test('CLI validates function and prehandler names with proper error codes', () => {
    const badFn = runCli(['function', 'invalid name!']);
    assert.equal(badFn.status, 1);
    assert.match(badFn.stderr, /\[INVALID_FUNCTION_NAME\]/);

    const badPre = runCli(['prehandler', 'bad/prehandler/name']);
    assert.equal(badPre.status, 1);
    assert.match(badPre.stderr, /\[INVALID_PREHANDLER_NAME\]/);
});

test('CLI reports PROJECT_ROOT_NOT_FOUND when executed outside a FastGCF project', () => {
    const result = runCli(['build', 'sample', '--type', 'bundle'], { cwd: repoRoot });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\[PROJECT_ROOT_NOT_FOUND\]/);
});

test('String utilities transform identifiers and route paths correctly', () => {
    assert.equal(nameToKebabCase('MyAwesomeService'), 'my-awesome-service');
    assert.equal(nameToKebabCase('user_payments API'), 'user-payments-api');
    assert.equal(toPascalCase('create-user'), 'CreateUser');
    assert.equal(toDocConstName('greeting-service'), 'GreetingServiceDoc');
    assert.equal(normalizeRoutePath('/v1/hellow/'), 'v1/hellow');
    assert.equal(normalizeRoutePath('v1/hellow'), 'v1/hellow');
    assert.equal(inferFunctionName({ handler: 'dist/hellow/index.js', path: 'v1/hellow' }), 'hellow');
});

test('Validation asserts throw FastgcfError on invalid inputs', () => {
    assert.throws(() => assertValidFunctionName(''), { name: 'FastgcfError' });
    assert.throws(() => assertValidFunctionName('has space'), { name: 'FastgcfError' });
    assert.doesNotThrow(() => assertValidFunctionName('valid_fn-123'));

    assert.throws(() => assertValidProjectName(''), { name: 'FastgcfError' });
    assert.throws(() => assertValidProjectName('invalid/project'), { name: 'FastgcfError' });
    assert.doesNotThrow(() => assertValidProjectName('my-gcp-service'));

    assert.throws(() => assertValidPreHandlerName(''), { name: 'FastgcfError' });
    assert.throws(() => assertValidPreHandlerName('rate.limit'), { name: 'FastgcfError' });
    assert.doesNotThrow(() => assertValidPreHandlerName('rate-limit'));
});

test('Doc manager can add and remove doc references cleanly', () => {
    const initialIndex = `
const paths: any[] = [
];

export default {
    paths: {
        ...mergePaths(paths)
    }
};
`;
    const updated = addDocToPathsArray(initialIndex, 'GreetingDoc');
    assert.match(updated, /GreetingDoc/);

    const initialWithPaths = `
export default {
    paths: {
        ...GreetingDoc,
        ...OtherDoc
    }
};
`;
    const cleaned = removeDocFromPaths(initialWithPaths, 'GreetingDoc');
    assert.doesNotMatch(cleaned, /GreetingDoc/);
    assert.match(cleaned, /OtherDoc/);
});

test('Build type normalizer and dependency extractor work as expected', () => {
    assert.equal(normalizeBuildType('bundle'), 'bundle');
    assert.equal(normalizeBuildType('single'), 'bundle');
    assert.equal(normalizeBuildType('modular'), 'modular');
    assert.equal(normalizeBuildType('unknown'), null);

    const fakeMetafile = {
        outputs: {
            'dist/greeting/index.js': {
                imports: [
                    { path: 'node:fs', external: true },
                    { path: 'path', external: true },
                    { path: 'zod', external: true },
                    { path: 'express', external: true },
                    { path: '@my-api/common/wrappers', external: true },
                    { path: './relative/helper.js', external: false },
                ],
            },
        },
    };

    const deps = extractUsedDependencies(fakeMetafile, repoRoot);
    assert.ok('zod' in deps);
    assert.ok('express' in deps);
    assert.ok(!('node:fs' in deps));
    assert.ok(!('path' in deps));
});

test('buildMethodValidationTemplate generates method-appropriate Zod schemas and context helpers', () => {
    const getTpl = buildMethodValidationTemplate('v1/users', 'GET');
    assert.match(getTpl.middlewareLines, /ValidationOptions\.QUERYPARAMS/);
    assert.match(getTpl.serviceExtraction, /event\.getQueryParam\("name", "World"\)/);

    const postTpl = buildMethodValidationTemplate('v1/users/{id}', 'POST');
    assert.match(postTpl.middlewareLines, /ValidationOptions\.PATHPARAMS/);
    assert.match(postTpl.middlewareLines, /ValidationOptions\.BODY/);
    assert.match(postTpl.serviceExtraction, /event\.getJsonBody<RequestBody>\(\)/);

    const deleteTpl = buildMethodValidationTemplate('v1/users/{orderId}', 'DELETE');
    assert.match(deleteTpl.middlewareLines, /ValidationOptions\.PATHPARAMS/);
    assert.match(deleteTpl.serviceExtraction, /event\.getPathParam\("orderId", "World"\)/);
});

test('End-to-end lifecycle: new -> function -> prehandler -> list -> build -> Express runner HTTP & OpenAPI -> drop', async () => {
    const tempBase = fs.mkdtempSync(path.join(repoRoot, 'temp-e2e-'));
    const projectName = 'demo-gcp-api';
    const projectRoot = path.join(tempBase, projectName);

    try {
        // 1. Scaffold project without running slow npm install
        await createProject(projectName, {
            baseDir: tempBase,
            skipInstall: true,
            silent: true,
        });

        assert.ok(fs.existsSync(path.join(projectRoot, 'fastgcf.json')));
        assert.ok(fs.existsSync(path.join(projectRoot, 'index.js')));
        assert.ok(fs.existsSync(path.join(projectRoot, 'util.js')));
        assert.ok(fs.existsSync(path.join(projectRoot, 'Dockerfile')));

        // Link node_modules from repoRoot so esbuild & runtime imports resolve packages
        fs.symlinkSync(
            path.join(repoRoot, 'node_modules'),
            path.join(projectRoot, 'node_modules'),
            'junction'
        );

        // 2. Create two functions: GET v1/hellow and POST v1/users
        await createGcfFunction('hellow', {
            rootDir: projectRoot,
            method: 'GET',
            path: 'v1/hellow',
            nonInteractive: true,
            silent: true,
        });

        await createGcfFunction('users', {
            rootDir: projectRoot,
            method: 'POST',
            path: 'v1/users',
            nonInteractive: true,
            silent: true,
        });

        // Verify duplicate route rejection
        await assert.rejects(
            async () => {
                await createGcfFunction('users-dup', {
                    rootDir: projectRoot,
                    method: 'POST',
                    path: 'v1/users',
                    nonInteractive: true,
                    silent: true,
                });
            },
            (err) => err.code === 'DUPLICATE_ROUTE_PATH'
        );

        // Verify preHandler was attached inside src/functions/hellow/index.ts and src/functions/users/index.ts
        const hellowIndexSrc = fs.readFileSync(
            path.join(projectRoot, 'src', 'functions', 'hellow', 'index.ts'),
            'utf-8'
        );
        assert.match(hellowIndexSrc, /import preHandler from "\.\.\/\.\.\/preHandlers\/preHandler";/);
        assert.match(hellowIndexSrc, /preHandlers:\s*\["dist\/preHandlers\/preHandler\.js"\]/);
        assert.match(hellowIndexSrc, /preHandlers:\s*\[preHandler\]/);

        // 3. Create an auth preHandler and attach it to "users"
        await generatePreHandler('auth', {
            rootDir: projectRoot,
            functions: 'users',
            nonInteractive: true,
            silent: true,
        });

        const usersIndexSrc = fs.readFileSync(
            path.join(projectRoot, 'src', 'functions', 'users', 'index.ts'),
            'utf-8'
        );
        assert.match(usersIndexSrc, /import auth from "\.\.\/\.\.\/preHandlers\/auth";/);
        assert.match(usersIndexSrc, /preHandlers:\s*\[preHandler,\s*auth\]/);

        // 4. List functions
        const listed = await listFunctions({ rootDir: projectRoot, json: true });
        assert.equal(listed.length, 2);
        const usersEntry = listed.find((r) => r.name === 'users');
        assert.ok(usersEntry);
        assert.ok(usersEntry.preHandlers.includes('dist/preHandlers/auth.js'));

        // 5. Build all functions, preHandlers, and OpenAPI docs
        await buildProject(undefined, {
            rootDir: projectRoot,
            type: 'bundle',
            nonInteractive: true,
            silent: true,
        });

        // Verify idempotency: running build a second time does not rewrite src/docs/index.ts or fastgcf.json
        const docIndexPath = path.join(projectRoot, 'src', 'docs', 'index.ts');
        const configPath = path.join(projectRoot, 'fastgcf.json');
        const mtimeDocBefore = fs.statSync(docIndexPath).mtimeMs;
        const mtimeConfigBefore = fs.statSync(configPath).mtimeMs;
        await new Promise((r) => setTimeout(r, 30));
        await buildProject(undefined, {
            rootDir: projectRoot,
            type: 'bundle',
            nonInteractive: true,
            silent: true,
        });
        assert.equal(fs.statSync(docIndexPath).mtimeMs, mtimeDocBefore);
        assert.equal(fs.statSync(configPath).mtimeMs, mtimeConfigBefore);

        assert.ok(fs.existsSync(path.join(projectRoot, 'dist', 'hellow', 'index.js')));
        assert.ok(fs.existsSync(path.join(projectRoot, 'dist', 'users', 'index.js')));
        assert.ok(fs.existsSync(path.join(projectRoot, 'dist', 'preHandlers', 'preHandler.js')));
        assert.ok(fs.existsSync(path.join(projectRoot, 'dist', 'preHandlers', 'auth.js')));
        assert.ok(fs.existsSync(path.join(projectRoot, 'dist', 'openapi.json')));

        // 6. Start the generated Express app and verify HTTP routes + preHandlers + OpenAPI
        const runnerUrl = pathToFileURL(path.join(projectRoot, 'index.js')).href;
        const { createApp } = await import(runnerUrl);
        const { app } = await createApp();

        const server = await new Promise((resolve) => {
            const srv = app.listen(0, () => resolve(srv));
        });
        const port = server.address().port;
        const baseUrl = `http://127.0.0.1:${port}`;

        try {
            // Health check
            const healthRes = await fetch(`${baseUrl}/health`);
            assert.equal(healthRes.status, 200);
            const healthBody = await healthRes.json();
            assert.equal(healthBody.status, 'ok');

            // GET /v1/hellow?name=Luis
            const hellowRes = await fetch(`${baseUrl}/v1/hellow?name=Luis`);
            assert.equal(hellowRes.status, 200);
            const hellowBody = await hellowRes.json();
            assert.equal(hellowBody.status, 'success');
            assert.equal(hellowBody.data.greeting, 'Hello, Luis! from function hellow');

            // POST /v1/users with invalid Authorization header -> 401 from auth preHandler
            const unauthRes = await fetch(`${baseUrl}/v1/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer invalid',
                },
                body: JSON.stringify({ name: 'Ana' }),
            });
            assert.equal(unauthRes.status, 401);

            // POST /v1/users with valid payload -> 200
            const usersRes = await fetch(`${baseUrl}/v1/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer valid-token',
                },
                body: JSON.stringify({ name: 'Ana' }),
            });
            assert.equal(usersRes.status, 200);
            const usersBody = await usersRes.json();
            assert.equal(usersBody.status, 'success');
            assert.equal(usersBody.data.greeting, 'Hello, Ana! from function users');

            // GET /openapi.json -> verify OpenAPI 3.0 spec has /v1/hellow and /v1/users
            const openApiRes = await fetch(`${baseUrl}/openapi.json`);
            assert.equal(openApiRes.status, 200);
            const openApiSpec = await openApiRes.json();
            assert.equal(openApiSpec.openapi, '3.0.0');
            assert.ok(openApiSpec.paths['/v1/hellow']?.get);
            assert.ok(openApiSpec.paths['/v1/users']?.post);
            assert.deepEqual(openApiSpec.paths['/v1/users'].post.security, [
                { BearerAuth: [] },
                { BasicAuth: [] },
            ]);
            assert.ok(openApiSpec.paths['/v1/users'].post.responses['401']);

            // GET /docs and /api/doc -> Swagger UI HTML with DownloadUrl plugin
            const docsRes = await fetch(`${baseUrl}/docs`);
            assert.equal(docsRes.status, 200);
            const docsHtml = await docsRes.text();
            assert.match(docsHtml, /SwaggerUIBundle/);
            assert.match(docsHtml, /SwaggerUIBundle\.plugins\.DownloadUrl/);

            const apiDocRes = await fetch(`${baseUrl}/api/doc`);
            assert.equal(apiDocRes.status, 200);
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }

        // 7. Drop function "hellow"
        const dropped = await dropGcfFunction('hellow', {
            rootDir: projectRoot,
            yes: true,
            silent: true,
        });
        assert.equal(dropped, true);
        assert.ok(!fs.existsSync(path.join(projectRoot, 'src', 'functions', 'hellow')));
        assert.ok(!fs.existsSync(path.join(projectRoot, 'dist', 'hellow')));

        const remaining = await listFunctions({ rootDir: projectRoot, json: true });
        assert.equal(remaining.length, 1);
        assert.equal(remaining[0].name, 'users');
    } finally {
        try {
            fs.rmSync(tempBase, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
        } catch {
            // Ignore transient Windows file lock on cleanup
        }
    }
});

