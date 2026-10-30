import pc from 'picocolors';
import { getProjectRootOrThrow, readFastgcfConfig } from '../../utils/project_context.js';
import { inferFunctionName, normalizeRoutePath } from '../../utils/string_utils.js';

export async function listFunctions(options = {}) {
    const projectRoot = options.rootDir || getProjectRootOrThrow();
    const config = readFastgcfConfig(projectRoot);
    const functions = config.functions || [];

    const rows = functions.map((fn) => {
        const name = inferFunctionName(fn);
        const methods = Array.isArray(fn.methods) && fn.methods.length > 0
            ? fn.methods.map((m) => String(m).toUpperCase()).join(', ')
            : 'ALL';
        const route = `/${normalizeRoutePath(fn.path)}`;
        const handler = fn.handler || `dist/${name}/index.js`;
        const preHandlers = Array.isArray(fn.preHandlers) ? fn.preHandlers : [];

        return {
            name,
            methods,
            path: route,
            handler,
            preHandlers,
        };
    });

    if (options.json) {
        console.log(JSON.stringify(rows, null, 2));
        return rows;
    }

    if (rows.length === 0) {
        console.log(pc.yellow('No functions registered in fastgcf.json.'));
        console.log(pc.cyan('Run "fastgcf function <name>" to create your first function.'));
        return rows;
    }

    console.log(pc.bold(pc.cyan(`\nRegistered Functions (${rows.length}):`)));
    console.log(pc.dim('─'.repeat(85)));
    console.log(
        `${pc.bold('NAME'.padEnd(18))} ${pc.bold('METHODS'.padEnd(10))} ${pc.bold('PATH'.padEnd(22))} ${pc.bold('HANDLER'.padEnd(25))} ${pc.bold('PREHANDLERS')}`
    );
    console.log(pc.dim('─'.repeat(85)));

    for (const row of rows) {
        const preStr = row.preHandlers.length > 0 ? row.preHandlers.join(', ') : '-';
        console.log(
            `${pc.green(row.name.padEnd(18))} ${pc.yellow(row.methods.padEnd(10))} ${pc.cyan(row.path.padEnd(22))} ${row.handler.padEnd(25)} ${pc.dim(preStr)}`
        );
    }
    console.log(pc.dim('─'.repeat(85)));
    return rows;
}

