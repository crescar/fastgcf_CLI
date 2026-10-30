import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { build } from 'esbuild';
import pc from 'picocolors';
import { getProjectRootOrThrow, readFastgcfConfig } from '../../utils/project_context.js';
import { syncAllFunctionsConfig } from '../../services/config/function_config_sync.js';
import { registerFunctionDoc } from '../../services/docs/doc_manager.js';
import { inferFunctionName } from '../../utils/string_utils.js';

export async function generateOpenApiBundle(options = {}) {
    const projectRoot = options.rootDir || getProjectRootOrThrow();
    syncAllFunctionsConfig(projectRoot);

    const config = readFastgcfConfig(projectRoot);
    for (const fn of config.functions) {
        const name = inferFunctionName(fn);
        const fnSrc = path.join(projectRoot, 'src', 'functions', name, 'index.ts');
        if (fs.existsSync(fnSrc) && fn.docs !== false) {
            const method = Array.isArray(fn.methods) && fn.methods[0] ? fn.methods[0] : 'GET';
            registerFunctionDoc(projectRoot, name, fn.path, method);
        }
    }

    const docsEntry = path.join(projectRoot, 'src', 'docs', 'index.ts');
    const distDir = path.join(projectRoot, 'dist');
    fs.mkdirSync(distDir, { recursive: true });

    const outOpenApiJson = path.join(distDir, 'openapi.json');
    const outDocModule = path.join(distDir, '__doc__', 'index.js');

    if (!fs.existsSync(docsEntry)) {
        const fallbackSpec = {
            openapi: '3.0.0',
            info: {
                title: `${config.service || 'FastGCF'} API Documentation`,
                version: '1.0.0',
            },
            paths: {},
        };
        fs.writeFileSync(outOpenApiJson, JSON.stringify(fallbackSpec, null, 2) + '\n', 'utf-8');
        return fallbackSpec;
    }

    fs.mkdirSync(path.dirname(outDocModule), { recursive: true });

    await build({
        entryPoints: [docsEntry],
        bundle: true,
        outfile: outDocModule,
        platform: 'node',
        format: 'esm',
        banner: {
            js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url); globalThis.__FASTGCF_DOC_MODE__ = true;',
        },
        sourcemap: false,
    });

    const docUrl = `${pathToFileURL(outDocModule).href}?t=${Date.now()}`;
    const docMod = await import(docUrl);
    const spec = docMod.default ?? docMod;

    fs.writeFileSync(outOpenApiJson, JSON.stringify(spec, null, 2) + '\n', 'utf-8');

    if (!options.silent) {
        const pathCount = Object.keys(spec.paths || {}).length;
        console.log(pc.green(`✔ OpenAPI 3.0 specification generated! (${pathCount} documented path(s))`));
        console.log(pc.cyan(`  JSON:   dist/openapi.json`));
        console.log(pc.cyan(`  Bundle: dist/__doc__/index.js`));
    }

    return spec;
}

