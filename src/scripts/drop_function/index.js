import fs from 'fs';
import path from 'path';
import enquirer from 'enquirer';
import pc from 'picocolors';
import figlet from 'figlet';
import { assertPathInsideProject, assertValidFunctionName } from '../../utils/cli_validation.js';
import { getProjectRootOrThrow, readFastgcfConfig, writeFastgcfConfig } from '../../utils/project_context.js';
import { inferFunctionName } from '../../utils/string_utils.js';
import { unregisterFunctionDoc } from '../../services/docs/doc_manager.js';
import { FastgcfError } from '../../utils/cli_error.js';

export async function dropGcfFunction(functionName, options = {}) {
    assertValidFunctionName(functionName);
    const projectRoot = options.rootDir || getProjectRootOrThrow();
    const config = readFastgcfConfig(projectRoot);

    const fnDir = path.join(projectRoot, 'src', 'functions', functionName);
    const distDir = path.join(projectRoot, 'dist', functionName);
    const inConfig = config.functions.some((f) => inferFunctionName(f) === functionName);

    if (!inConfig && !fs.existsSync(fnDir)) {
        throw new FastgcfError(`Function "${functionName}" not found in fastgcf.json or src/functions.`, {
            code: 'FUNCTION_NOT_FOUND',
            hint: 'Use "fastgcf list" to inspect registered functions.',
        });
    }

    if (!options.yes && process.stdin.isTTY) {
        const response = await enquirer.prompt({
            type: 'confirm',
            name: 'confirmDrop',
            message: pc.yellow(`Are you sure you want to drop the function "${functionName}"? This action cannot be undone.`),
            initial: false,
        });

        if (!response.confirmDrop) {
            console.log(pc.yellow('Function drop cancelled.'));
            return false;
        }
    }

    assertPathInsideProject(projectRoot, fnDir, 'function source directory');
    assertPathInsideProject(projectRoot, distDir, 'function dist directory');

    if (fs.existsSync(fnDir)) {
        fs.rmSync(fnDir, { recursive: true, force: true });
    }
    if (fs.existsSync(distDir)) {
        fs.rmSync(distDir, { recursive: true, force: true });
    }

    config.functions = config.functions.filter((f) => inferFunctionName(f) !== functionName);
    writeFastgcfConfig(config, projectRoot);
    unregisterFunctionDoc(projectRoot, functionName);

    if (!options.silent) {
        const figletText = await new Promise((resolve) => {
            figlet('Function Dropped!', { font: 'Standard' }, (err, data) => {
                if (err) {
                    resolve('Function Dropped!');
                    return;
                }
                resolve(data);
            });
        });

        console.log(pc.green(figletText));
    }

    return true;
}

