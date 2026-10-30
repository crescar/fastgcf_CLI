import fs from 'fs';
import path from 'path';
import { getProjectRootOrThrow, readFastgcfConfig, writeFastgcfConfig } from '../../../utils/project_context.js';
import { normalizeRoutePath, inferFunctionName } from '../../../utils/string_utils.js';
import { FastgcfError } from '../../../utils/cli_error.js';

export function getAvailablePreHandlers(projectRoot = getProjectRootOrThrow()) {
    const srcPreDir = path.join(projectRoot, 'src', 'preHandlers');
    const names = new Set();

    if (fs.existsSync(srcPreDir)) {
        for (const entry of fs.readdirSync(srcPreDir, { withFileTypes: true })) {
            if (entry.isFile() && /\.[jt]s$/.test(entry.name) && !/\.spec\.[jt]s$/.test(entry.name)) {
                names.add(entry.name.replace(/\.[jt]s$/, ''));
            }
        }
    }

    return [...names];
}

export function normalizePreHandlerDistPath(preHandlerNameOrPath) {
    const raw = String(preHandlerNameOrPath || '').trim().replace(/\\/g, '/');
    if (!raw) return null;
    if (raw.startsWith('dist/')) {
        return raw.endsWith('.js') ? raw : `${raw}.js`;
    }
    const cleanName = raw
        .replace(/^src\/preHandlers\//, '')
        .replace(/\.[jt]s$/, '');
    return `dist/preHandlers/${cleanName}.js`;
}

export function updateFastGcfJson(
    functionName,
    routePath,
    method = 'GET',
    preHandlers = ['dist/preHandlers/preHandler.js'],
    rootDir = null
) {
    const projectRoot = rootDir || getProjectRootOrThrow();
    const config = readFastgcfConfig(projectRoot);
    const cleanPath = normalizeRoutePath(routePath || `v1/${functionName}`);
    const upperMethods = (Array.isArray(method) ? method : [method]).map((m) =>
        String(m || 'GET').toUpperCase()
    );

    const normalizedPreHandlers = (Array.isArray(preHandlers) ? preHandlers : [])
        .map(normalizePreHandlerDistPath)
        .filter(Boolean);

    // Check duplicate path + method conflict
    for (const fn of config.functions) {
        if (inferFunctionName(fn) === functionName) continue;
        const existingPath = normalizeRoutePath(fn.path);
        if (existingPath === cleanPath) {
            const existingMethods = Array.isArray(fn.methods) && fn.methods.length > 0
                ? fn.methods.map((m) => String(m).toUpperCase())
                : ['ALL'];
            const conflict =
                existingMethods.includes('ALL') ||
                upperMethods.includes('ALL') ||
                upperMethods.some((m) => existingMethods.includes(m));
            if (conflict) {
                throw new FastgcfError(
                    `Route "${cleanPath}" with method [${upperMethods.join(', ')}] is already registered by function "${inferFunctionName(fn)}".`,
                    {
                        code: 'DUPLICATE_ROUTE_PATH',
                        hint: 'Choose a different route path or HTTP method.',
                    }
                );
            }
        }
    }

    const newEntry = {
        name: functionName,
        handler: `dist/${functionName}/index.js`,
        path: cleanPath,
        methods: upperMethods,
        preHandlers: normalizedPreHandlers,
    };

    const existingIdx = config.functions.findIndex(
        (f) => inferFunctionName(f) === functionName
    );
    if (existingIdx >= 0) {
        config.functions[existingIdx] = newEntry;
    } else {
        config.functions.push(newEntry);
    }

    writeFastgcfConfig(config, projectRoot);
    return newEntry;
}

