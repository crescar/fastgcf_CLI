import fs from 'fs';
import path from 'path';
import { FastgcfError } from '../../../utils/cli_error.js';
import { getProjectRootOrThrow } from '../../../utils/project_context.js';
import { inferFunctionName } from '../../../utils/string_utils.js';

export function getRegisteredFunctionNames(rootDir = null) {
    const projectRoot = rootDir || getProjectRootOrThrow();
    const configPath = path.join(projectRoot, 'fastgcf.json');
    if (!fs.existsSync(configPath)) {
        throw new FastgcfError('fastgcf.json not found in current directory.', {
            code: 'PROJECT_CONFIG_NOT_FOUND',
            hint: 'Run this command inside a FastGCF project.',
        });
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const functions = config?.functions;
    if (!Array.isArray(functions)) {
        return [];
    }

    return functions.map((fn) => inferFunctionName(fn));
}

