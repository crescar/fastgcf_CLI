import fs from 'fs';
import path from 'path';
import enquirer from 'enquirer';
import pc from 'picocolors';
import { assertPathInsideProject, assertValidPreHandlerName } from '../../utils/cli_validation.js';
import { getProjectRootOrThrow, readFastgcfConfig, writeFastgcfConfig } from '../../utils/project_context.js';
import { toCamelCase, inferFunctionName } from '../../utils/string_utils.js';
import { FastgcfError } from '../../utils/cli_error.js';

export function attachPreHandlerToFunctionSource(projectRoot, functionName, preHandlerName) {
    const fnIndexPath = path.join(projectRoot, 'src', 'functions', functionName, 'index.ts');
    if (!fs.existsSync(fnIndexPath)) {
        return false;
    }

    let content = fs.readFileSync(fnIndexPath, 'utf-8');
    const fnIdentifier = toCamelCase(preHandlerName) || 'preHandler';
    const distRelPath = `dist/preHandlers/${preHandlerName}.js`;
    const importLine = `import ${fnIdentifier} from "../../preHandlers/${preHandlerName}";`;

    // 1. Add import if not present
    if (!content.includes(`from "../../preHandlers/${preHandlerName}"`)) {
        const importMatches = [...content.matchAll(/^import\s[\s\S]*?from\s+["'][^"']+["'];$/gm)];
        if (importMatches.length > 0) {
            const lastImport = importMatches[importMatches.length - 1];
            const insertAt = (lastImport.index ?? 0) + lastImport[0].length;
            content = `${content.slice(0, insertAt)}\n${importLine}${content.slice(insertAt)}`;
        } else {
            content = `${importLine}\n${content}`;
        }
    }

    // 2. Add to event.preHandlers: [...] or insert into event: { ... }
    const eventPreRegex = /(\bevent\s*:\s*\{[\s\S]*?\bpreHandlers\s*:\s*\[)([^\]]*)(\])/m;
    if (eventPreRegex.test(content)) {
        content = content.replace(eventPreRegex, (full, prefix, items, suffix) => {
            if (items.includes(`"${distRelPath}"`) || items.includes(`'${distRelPath}'`)) {
                return full;
            }
            const trimmed = items.trim();
            const nextItems = trimmed ? `${trimmed.replace(/,\s*$/, '')}, "${distRelPath}"` : `"${distRelPath}"`;
            return `${prefix}${nextItems}${suffix}`;
        });
    } else {
        content = content.replace(
            /(\bevent\s*:\s*\{\s*\n(?:\s*[^\n]+\n)*?)(\s*\},)/m,
            `$1            preHandlers: ["${distRelPath}"],\n$2`
        );
    }

    // 3. Add to top-level preHandlers: [...] inside handlerResponse({ ... })
    const topPreRegex = /(\bpreHandlers\s*:\s*\[)([^\]]*)(\])/g;
    let foundIdentifierArray = false;
    content = content.replace(topPreRegex, (full, prefix, items, suffix) => {
        if (items.includes('"') || items.includes("'")) {
            return full; // That's event.preHandlers (string array)
        }
        foundIdentifierArray = true;
        const idRegex = new RegExp(`\\b${fnIdentifier}\\b`);
        if (idRegex.test(items)) {
            return full;
        }
        const trimmed = items.trim();
        const nextItems = trimmed ? `${trimmed.replace(/,\s*$/, '')}, ${fnIdentifier}` : fnIdentifier;
        return `${prefix}${nextItems}${suffix}`;
    });

    if (!foundIdentifierArray) {
        content = content.replace(
            /(\bevent\s*:\s*\{[\s\S]*?\},)/m,
            `$1\n        preHandlers: [${fnIdentifier}],`
        );
    }

    fs.writeFileSync(fnIndexPath, content, 'utf-8');
    return true;
}

export async function generatePreHandler(preHandlerName, options = {}) {
    assertValidPreHandlerName(preHandlerName);
    const projectRoot = options.rootDir || getProjectRootOrThrow();

    const fnIdentifier = toCamelCase(preHandlerName) || 'preHandler';
    const isAuthLike = /auth/i.test(preHandlerName);

    const preHandlerTemplate = isAuthLike
        ? `import type { Request, Response, NextFunction } from "express";

export function ${fnIdentifier}(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers["authorization"];
    if (authHeader === "Unauthorized" || authHeader === "Bearer invalid") {
        res.status(401).json({
            message: "Unauthorized",
            error: "Invalid or missing authorization token",
        });
        return;
    }

    (req as any).auth = {
        id: "usr_123",
        email: "user@fastgcf.dev",
        roles: ["admin"],
    };
    next();
}

export default ${fnIdentifier};
`
        : `import type { Request, Response, NextFunction } from "express";

export function ${fnIdentifier}(req: Request, _res: Response, next: NextFunction): void {
    console.log(\`[PreHandler:${preHandlerName}] \${req.method} \${req.path}\`);
    next();
}

export default ${fnIdentifier};
`;

    const preHandlersDir = path.join(projectRoot, 'src', 'preHandlers');
    assertPathInsideProject(projectRoot, preHandlersDir, 'preHandlers directory');
    fs.mkdirSync(preHandlersDir, { recursive: true });

    const preHandlerPath = path.join(preHandlersDir, `${preHandlerName}.ts`);
    assertPathInsideProject(projectRoot, preHandlerPath, 'preHandler file');

    if (fs.existsSync(preHandlerPath)) {
        throw new FastgcfError(
            `PreHandler "${preHandlerName}" already exists at: ${path.relative(projectRoot, preHandlerPath)}`,
            {
                code: 'PREHANDLER_ALREADY_EXISTS',
                hint: 'Choose a different name or edit the existing preHandler file.',
            }
        );
    }

    fs.writeFileSync(preHandlerPath, preHandlerTemplate, 'utf-8');

    const distRelPath = `dist/preHandlers/${preHandlerName}.js`;
    const config = readFastgcfConfig(projectRoot);
    let targetFunctions = [];

    if (options.functions) {
        targetFunctions = String(options.functions)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
    } else if (process.stdin.isTTY && !options.nonInteractive && config.functions.length > 0) {
        const fnNames = config.functions.map((f) => inferFunctionName(f));
        const answer = await enquirer.prompt({
            type: 'multiselect',
            name: 'selectedFunctions',
            message: `Select functions to attach preHandler "${preHandlerName}" to (space to select, enter to confirm):`,
            choices: fnNames.map((name) => ({ name, value: name })),
        });
        if (Array.isArray(answer.selectedFunctions)) {
            targetFunctions = answer.selectedFunctions;
        }
    }

    if (targetFunctions.length > 0) {
        const targetSet = new Set(targetFunctions);
        let updated = false;
        for (const fn of config.functions) {
            const name = inferFunctionName(fn);
            if (targetSet.has(name)) {
                if (!Array.isArray(fn.preHandlers)) {
                    fn.preHandlers = [];
                }
                if (!fn.preHandlers.includes(distRelPath)) {
                    fn.preHandlers.push(distRelPath);
                    updated = true;
                }
                attachPreHandlerToFunctionSource(projectRoot, name, preHandlerName);
            }
        }
        if (updated) {
            writeFastgcfConfig(config, projectRoot);
        }
    }

    if (!options.silent) {
        console.log(pc.green(`✔ PreHandler "${preHandlerName}" created successfully!`));
        console.log(pc.cyan(`  Source: src/preHandlers/${preHandlerName}.ts`));
        console.log(pc.cyan(`  Dist:   ${distRelPath}`));
        if (targetFunctions.length > 0) {
            console.log(pc.cyan(`  Attached to functions: ${targetFunctions.join(', ')}`));
        }
    }
}
