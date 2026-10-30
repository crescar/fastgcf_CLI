import fs from 'fs';
import path from 'path';
import { FastgcfError } from './cli_error.js';

export const FASTGCF_CONFIG_FILE = 'fastgcf.json';

export function findProjectRoot(startDir = process.cwd()) {
    let currentDir = path.resolve(startDir);

    while (true) {
        const configPath = path.join(currentDir, FASTGCF_CONFIG_FILE);
        if (fs.existsSync(configPath)) {
            return currentDir;
        }

        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) {
            return null;
        }

        currentDir = parentDir;
    }
}

export function getProjectRootOrThrow(startDir = process.cwd()) {
    const root = findProjectRoot(startDir);
    if (!root) {
        throw new FastgcfError('fastgcf.json not found in current directory or parent directories.', {
            code: 'PROJECT_ROOT_NOT_FOUND',
            hint: 'Run this command inside a FastGCF project (where fastgcf.json exists).',
        });
    }

    return root;
}

export function resolveFromProject(projectRoot, ...segments) {
    return path.resolve(projectRoot, ...segments);
}

export function readFastgcfConfig(projectRoot = getProjectRootOrThrow()) {
    const configPath = path.join(projectRoot, FASTGCF_CONFIG_FILE);
    if (!fs.existsSync(configPath)) {
        throw new FastgcfError('fastgcf.json not found in project root.', {
            code: 'PROJECT_CONFIG_NOT_FOUND',
            hint: 'Run this command inside a FastGCF project.',
        });
    }

    try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.functions)) {
            parsed.functions = [];
        }
        return parsed;
    } catch (error) {
        throw new FastgcfError(`Invalid JSON in fastgcf.json: ${error instanceof Error ? error.message : String(error)}`, {
            code: 'INVALID_PROJECT_CONFIG',
            hint: 'Fix the JSON syntax in fastgcf.json.',
        });
    }
}

export function writeFastgcfConfig(config, projectRoot = getProjectRootOrThrow()) {
    const configPath = path.join(projectRoot, FASTGCF_CONFIG_FILE);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 4) + '\n', 'utf-8');
}

