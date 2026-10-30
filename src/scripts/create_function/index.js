import enquirer from 'enquirer';
import pc from 'picocolors';
import { existFunction } from './services/exist_function.js';
import { createFunctionFiles } from './services/create_function.js';
import {
    updateFastGcfJson,
    getAvailablePreHandlers,
} from './services/update_fastgcf_json.js';
import { createBaseDoc } from './services/create_base_doc.js';
import { assertValidFunctionName } from '../../utils/cli_validation.js';
import { normalizeRoutePath } from '../../utils/string_utils.js';
import { FastgcfError } from '../../utils/cli_error.js';

export async function createGcfFunction(functionName, options = {}) {
    assertValidFunctionName(functionName);

    const { fileNotFound, exists, projectRoot } = existFunction(functionName, options.rootDir);
    if (fileNotFound) {
        throw new FastgcfError('fastgcf.json not found in current directory or parent directories.', {
            code: 'PROJECT_ROOT_NOT_FOUND',
            hint: 'Make sure you are running this command inside a FastGCF project.',
        });
    }

    if (exists) {
        throw new FastgcfError(`Function "${functionName}" already exists. Please choose a different name.`, {
            code: 'FUNCTION_ALREADY_EXISTS',
            hint: `Use "fastgcf drop ${functionName}" first if you want to replace it.`,
        });
    }

    let method = options.method ? String(options.method).toLowerCase() : null;
    let fullPath = options.path ? normalizeRoutePath(options.path) : null;
    let preHandlers = null;

    if (options.prehandler) {
        preHandlers = String(options.prehandler)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
    }

    const isInteractive = Boolean(process.stdin.isTTY) && !options.nonInteractive && (!method || !fullPath);

    if (isInteractive) {
        const availablePreHandlers = getAvailablePreHandlers(projectRoot);
        const questions = [];

        if (!method) {
            questions.push({
                type: 'select',
                name: 'methods',
                message: 'Select the HTTP method to be supported by the function:',
                choices: [
                    { name: 'GET', value: 'get' },
                    { name: 'POST', value: 'post' },
                    { name: 'PUT', value: 'put' },
                    { name: 'DELETE', value: 'delete' },
                    { name: 'PATCH', value: 'patch' },
                    { name: 'HEAD', value: 'head' },
                    { name: 'OPTIONS', value: 'options' },
                ],
                initial: 0,
            });
        }

        if (!fullPath) {
            questions.push(
                {
                    type: 'input',
                    name: 'version',
                    message: 'Enter the version prefix for your function:',
                    default: 'v1',
                },
                {
                    type: 'input',
                    name: 'route',
                    message: 'Enter the route for your function (without version prefix):',
                    default: `/${functionName}`,
                }
            );
        }

        if (!preHandlers && availablePreHandlers.length > 0) {
            questions.push({
                type: 'select',
                name: 'selectedPreHandler',
                message: 'Select a preHandler to execute before this function:',
                choices: [
                    ...availablePreHandlers.map((name) => ({
                        name,
                        message: `${name} (dist/preHandlers/${name}.js)`,
                        value: name,
                    })),
                    { name: 'none', message: 'None (No preHandlers)', value: 'none' },
                ],
                initial: 0,
            });
        }

        const answers = await enquirer.prompt(questions);
        if (!method) {
            method = Array.isArray(answers.methods) ? answers.methods[0] : answers.methods;
        }
        if (!fullPath) {
            let route = String(answers.route || `/${functionName}`).trim();
            if (!route.startsWith('/')) {
                route = '/' + route;
            }
            const version = String(answers.version || 'v1').trim().replace(/^\/+|\/+$/g, '');
            fullPath = normalizeRoutePath(version ? `${version}${route}` : route);
        }
        if (!preHandlers) {
            if (answers.selectedPreHandler && answers.selectedPreHandler !== 'none') {
                preHandlers = [`dist/preHandlers/${answers.selectedPreHandler}.js`];
            } else if (answers.selectedPreHandler === 'none') {
                preHandlers = [];
            }
        }
    }

    const resolvedMethod = (method || 'get').toLowerCase();
    const resolvedPath = fullPath || `v1/${functionName}`;
    const resolvedPreHandlers =
        preHandlers !== null
            ? preHandlers
            : getAvailablePreHandlers(projectRoot).includes('preHandler')
            ? ['dist/preHandlers/preHandler.js']
            : [];

    const entry = updateFastGcfJson(
        functionName,
        resolvedPath,
        resolvedMethod,
        resolvedPreHandlers,
        projectRoot
    );
    createFunctionFiles(functionName, resolvedPath, resolvedMethod, {
        rootDir: projectRoot,
        preHandlers: entry.preHandlers,
    });
    createBaseDoc(functionName, `/${resolvedPath}`, resolvedMethod, projectRoot);

    if (!options.silent) {
        console.log(pc.green(`✔ Function "${functionName}" created successfully!`));
        console.log(pc.cyan(`  Handler:     src/functions/${functionName}/index.ts`));
        console.log(pc.cyan(`  Schemas:     src/functions/${functionName}/schemas/index.ts`));
        console.log(pc.cyan(`  Service:     src/functions/${functionName}/services/index.ts`));
        console.log(pc.cyan(`  Route:       [${resolvedMethod.toUpperCase()}] /${entry.path}`));
        if (entry.preHandlers.length > 0) {
            console.log(pc.cyan(`  PreHandlers: ${entry.preHandlers.join(', ')}`));
        }
    }
}
