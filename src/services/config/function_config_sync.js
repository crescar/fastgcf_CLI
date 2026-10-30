import fs from 'fs';
import path from 'path';
import { findMatchingToken } from '../docs/doc_manager.js';
import { normalizeRoutePath, inferFunctionName } from '../../utils/string_utils.js';
import { normalizePreHandlerDistPath } from '../../scripts/create_function/services/update_fastgcf_json.js';

function extractPropertyBlock(objectLiteralStr, propName) {
    const propRegex = new RegExp(`(?:^|[,{\\s])${propName}\\s*:\\s*([\\[{])`, 'm');
    const match = objectLiteralStr.match(propRegex);
    if (!match || match.index === undefined) {
        return null;
    }

    const openChar = match[1];
    const closeChar = openChar === '{' ? '}' : ']';
    const openIndex = match.index + match[0].lastIndexOf(openChar);
    const closeIndex = findMatchingToken(objectLiteralStr, openIndex, openChar, closeChar);
    if (closeIndex === -1) {
        return null;
    }

    return objectLiteralStr.slice(openIndex, closeIndex + 1);
}

function parseSimpleObjectLiteral(blockStr) {
    if (!blockStr) return null;

    try {
        const jsonCandidate = blockStr
            .replace(/\/\/.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, inner) => `"${inner.replace(/"/g, '\\"')}"`)
            .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":')
            .replace(/,\s*([}\]])/g, '$1');

        return JSON.parse(jsonCandidate);
    } catch {
        let topLevelStr = blockStr;
        const errorsBlock = extractPropertyBlock(topLevelStr, 'errors');
        if (errorsBlock) {
            topLevelStr = topLevelStr.replace(errorsBlock, '{}');
        }

        const extracted = {};
        for (const prop of ['method', 'path', 'summary', 'description']) {
            const m = topLevelStr.match(new RegExp(`\\b${prop}\\s*:\\s*["'\`]([^"'\`]+)["'\`]`));
            if (m) {
                extracted[prop] = m[1];
            }
        }

        const methodsMatch = topLevelStr.match(/\bmethods?\s*:\s*\[([^\]]*)\]/);
        if (methodsMatch) {
            extracted.methods = [...methodsMatch[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
        }

        const preHandlersMatch = topLevelStr.match(/\bpreHandlers\s*:\s*\[([^\]]*)\]/);
        if (preHandlersMatch) {
            extracted.preHandlers = [...preHandlersMatch[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
        }

        const tagsMatch = topLevelStr.match(/\btags\s*:\s*\[([^\]]*)\]/);
        if (tagsMatch) {
            extracted.tags = [...tagsMatch[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
        }

        return Object.keys(extracted).length > 0 ? extracted : null;
    }
}

export function extractFunctionMetadataFromSource(sourceCode) {
    const callRegex = /\bhandlerResponse\s*(?:<[\s\S]*?>)?\s*\(\s*\{/m;
    const match = sourceCode.match(callRegex);
    let eventObj = null;
    let docMeta = null;
    let importedPreHandlers = null;

    // Map imported preHandler identifiers: import preHandler from "../../preHandlers/preHandler"
    const importMap = new Map();
    const importRegex = /import\s+(?:\{\s*([A-Za-z0-9_$]+)\s*\}|([A-Za-z0-9_$]+))\s+from\s+["'](?:\.\.\/)+preHandlers\/([^"'.]+)(?:\.[jt]s)?["']/g;
    for (const m of sourceCode.matchAll(importRegex)) {
        const id = m[1] || m[2];
        const fileBase = m[3];
        if (id && fileBase) {
            importMap.set(id, `dist/preHandlers/${fileBase}.js`);
        }
    }

    if (match && match.index !== undefined) {
        const openBraceIndex = match.index + match[0].lastIndexOf('{');
        const closeBraceIndex = findMatchingToken(sourceCode, openBraceIndex, '{', '}');
        if (closeBraceIndex !== -1) {
            const optionsStr = sourceCode.slice(openBraceIndex, closeBraceIndex + 1);
            const eventBlockStr = extractPropertyBlock(optionsStr, 'event');
            const docBlockStr = extractPropertyBlock(optionsStr, 'doc');
            const topPreBlockStr = extractPropertyBlock(optionsStr, 'preHandlers') || extractPropertyBlock(optionsStr, 'before');

            if (eventBlockStr) {
                const parsed = parseSimpleObjectLiteral(eventBlockStr);
                eventObj = Array.isArray(parsed) ? parsed[0] : parsed;
            }
            if (docBlockStr) {
                docMeta = parseSimpleObjectLiteral(docBlockStr);
            }
            if (topPreBlockStr) {
                const inner = topPreBlockStr.slice(1, -1);
                const resolved = [];
                for (const tokenMatch of inner.matchAll(/["'`]([^"'`]+)["'`]|([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
                    const strLiteral = tokenMatch[1];
                    const identifier = tokenMatch[2];
                    if (strLiteral) {
                        resolved.push(normalizePreHandlerDistPath(strLiteral));
                    } else if (identifier && importMap.has(identifier)) {
                        resolved.push(importMap.get(identifier));
                    }
                }
                if (resolved.length > 0) {
                    importedPreHandlers = resolved.filter(Boolean);
                }
            }
        }
    }

    // Also support JSDoc @fastgcf annotations
    const commentBlocks = [...sourceCode.matchAll(/\/\*\*([\s\S]*?)\*\//g)];
    for (const cMatch of commentBlocks) {
        const block = cMatch[1];
        if (!/@(?:fastgcf|method|path|route|summary|tags?)\b/i.test(block)) {
            continue;
        }
        const lines = block.split(/\r?\n/).map((l) => l.replace(/^\s*\*\s?/, '').trim());
        for (const line of lines) {
            const mMatch = line.match(/^@method\s+([A-Za-z]+)/i);
            if (mMatch && !eventObj?.method) {
                eventObj = eventObj || {};
                eventObj.method = mMatch[1].toUpperCase();
            }
            const pMatch = line.match(/^@(?:path|route)\s+(\S+)/i);
            if (pMatch && !eventObj?.path) {
                eventObj = eventObj || {};
                eventObj.path = pMatch[1].trim();
            }
            const sMatch = line.match(/^@summary\s+(.+)$/i);
            if (sMatch && !docMeta?.summary) {
                docMeta = docMeta || {};
                docMeta.summary = sMatch[1].trim();
            }
            const tMatch = line.match(/^@tags?\s+(.+)$/i);
            if (tMatch && !docMeta?.tags) {
                docMeta = docMeta || {};
                docMeta.tags = tMatch[1].split(',').map((t) => t.trim()).filter(Boolean);
            }
        }
    }

    const rawMethods = eventObj?.methods || (eventObj?.method ? [eventObj.method] : null);
    const methods = Array.isArray(rawMethods)
        ? rawMethods.map((m) => String(m).toUpperCase())
        : null;
    const routePath = eventObj?.path ? normalizeRoutePath(eventObj.path) : null;

    const eventPreHandlers = Array.isArray(eventObj?.preHandlers)
        ? eventObj.preHandlers.map(normalizePreHandlerDistPath).filter(Boolean)
        : null;

    const preHandlers = eventPreHandlers || importedPreHandlers || null;

    return {
        methods,
        path: routePath,
        preHandlers,
        docMeta,
    };
}

export function syncFunctionConfig(projectRoot, functionName) {
    if (!functionName || functionName === '__doc__') {
        return false;
    }

    const entryPath = path.join(projectRoot, 'src', 'functions', functionName, 'index.ts');
    if (!fs.existsSync(entryPath)) {
        return false;
    }

    const configPath = path.join(projectRoot, 'fastgcf.json');
    if (!fs.existsSync(configPath)) {
        return false;
    }

    const sourceCode = fs.readFileSync(entryPath, 'utf-8');
    const { methods, path: routePath, preHandlers } = extractFunctionMetadataFromSource(sourceCode);

    const existingRaw = fs.readFileSync(configPath, 'utf-8');
    let config;
    try {
        config = JSON.parse(existingRaw);
    } catch {
        return false;
    }

    if (!Array.isArray(config.functions)) {
        config.functions = [];
    }

    const existingIdx = config.functions.findIndex(
        (f) => inferFunctionName(f) === functionName
    );

    if (existingIdx === -1) {
        config.functions.push({
            name: functionName,
            handler: `dist/${functionName}/index.js`,
            path: routePath || `v1/${functionName}`,
            methods: methods || ['GET'],
            preHandlers: preHandlers || ['dist/preHandlers/preHandler.js'],
        });
    } else {
        const current = config.functions[existingIdx];
        config.functions[existingIdx] = {
            ...current,
            name: current.name || functionName,
            handler: current.handler || `dist/${functionName}/index.js`,
            path: routePath || normalizeRoutePath(current.path || `v1/${functionName}`),
            ...(methods ? { methods } : {}),
            ...(preHandlers ? { preHandlers } : {}),
        };
    }

    const serialized = JSON.stringify(config, null, 4) + '\n';
    if (serialized.replace(/\r\n/g, '\n').trim() !== existingRaw.replace(/\r\n/g, '\n').trim()) {
        fs.writeFileSync(configPath, serialized, 'utf-8');
        return true;
    }

    return false;
}

export function syncAllFunctionsConfig(projectRoot) {
    const functionsDir = path.join(projectRoot, 'src', 'functions');
    if (!fs.existsSync(functionsDir)) {
        return;
    }

    const entries = fs.readdirSync(functionsDir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            syncFunctionConfig(projectRoot, entry.name);
        }
    }
}
