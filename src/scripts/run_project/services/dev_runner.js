import { spawn } from 'child_process';
import { pathToFileURL } from 'url';
import { buildProject } from '../../build/index.js';
import { clearConsole } from '../../../utils/clear_console.js';
import { getRegisteredFunctionNames } from './function_registry.js';
import { getProjectRootOrThrow } from '../../../utils/project_context.js';

const ALL_FUNCTIONS_FLAG = '__all__';

function startProjectServer(projectRoot) {
    return spawn('node', ['index.js'], {
        stdio: 'inherit',
        shell: true,
        cwd: projectRoot,
    });
}

function resolveTargetFunctions(functionName) {
    if (functionName && functionName !== ALL_FUNCTIONS_FLAG) {
        return [functionName];
    }

    const allFunctions = getRegisteredFunctionNames();
    if (!allFunctions.length) {
        throw new Error('No functions registered in fastgcf.json');
    }

    return allFunctions;
}

async function prepareProject(functionName) {
    if (!functionName || functionName === ALL_FUNCTIONS_FLAG) {
        await buildProject(undefined, { type: 'bundle', nonInteractive: true });
        return;
    }

    const targetFunctions = resolveTargetFunctions(functionName);
    for (const name of targetFunctions) {
        await buildProject(name, { type: 'bundle', nonInteractive: true });
    }
}

export async function runDevRunner(functionName) {
    if (functionName === undefined) {
        throw new Error('functionName argument is required');
    }

    const projectRoot = getProjectRootOrThrow();
    clearConsole();
    await prepareProject(functionName);
    const serverProcess = startProjectServer(projectRoot);

    const shutdown = () => {
        if (!serverProcess.killed) {
            serverProcess.kill();
        }
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    serverProcess.on('exit', (code) => {
        process.exit(code ?? 0);
    });
}

const executedDirectly =
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href;

if (executedDirectly) {
    runDevRunner(process.argv[2]).catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}

