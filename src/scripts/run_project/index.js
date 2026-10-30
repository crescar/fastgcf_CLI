import nodemon from 'nodemon';
import path from 'path';
import { fileURLToPath } from 'url';
import { clearConsole } from '../../utils/clear_console.js';
import { getRegisteredFunctionNames } from './services/function_registry.js';
import { getProjectRootOrThrow } from '../../utils/project_context.js';
import { FastgcfError } from '../../utils/cli_error.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WATCH_EXTENSIONS = 'ts,json';
const IGNORE_PATTERNS = [
    '**/*.spec.ts',
    '**/*.test.ts',
    'dist/**',
    '**/dist/**',
    'src/docs/**',
    '**/src/docs/**',
    'node_modules/**',
    '.fastgcf.*',
];

function resolveTargetFunctions(functionName) {
    if (functionName) {
        return [functionName];
    }

    const allFunctions = getRegisteredFunctionNames();
    if (!allFunctions.length) {
        throw new FastgcfError('No functions registered in fastgcf.json.', {
            code: 'NO_FUNCTIONS_FOUND',
            hint: 'Create a function first using: fastgcf function <function-name>',
        });
    }

    return allFunctions;
}

export function runProject(functionName) {
    const runnerPath = path.join(__dirname, 'services', 'dev_runner.js');
    const projectRoot = getProjectRootOrThrow();
    const targetFunctions = resolveTargetFunctions(functionName);
    const watchPaths = [
        ...targetFunctions.map((name) => path.join(projectRoot, 'src', 'functions', name)),
        path.join(projectRoot, 'src', 'preHandlers'),
        path.join(projectRoot, 'libs', 'common'),
        path.join(projectRoot, 'fastgcf.json'),
    ];

    clearConsole();
    nodemon({
        script: runnerPath,
        args: [functionName ?? '__all__'],
        exec: 'node',
        watch: watchPaths,
        ext: WATCH_EXTENSIONS,
        ignore: IGNORE_PATTERNS,
        delay: 300,
    });

    nodemon.on('restart', (files) => {
        if (files?.length) {
            console.log(`Rebuilding because of changes in: ${files.join(', ')}`);
        }
    });

    nodemon.on('quit', () => {
        process.exit();
    });
}
