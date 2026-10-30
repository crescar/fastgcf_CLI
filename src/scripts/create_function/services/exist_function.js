import fs from 'fs';
import path from 'path';
import { findProjectRoot } from '../../../utils/project_context.js';
import { inferFunctionName } from '../../../utils/string_utils.js';

export function existFunction(functionName, startDir = process.cwd()) {
    const projectRoot = findProjectRoot(startDir);
    if (!projectRoot) {
        return { fileNotFound: true, exists: false };
    }

    const configPath = path.join(projectRoot, 'fastgcf.json');
    if (!fs.existsSync(configPath)) {
        return { fileNotFound: true, exists: false };
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const functions = Array.isArray(config.functions) ? config.functions : [];
    const inConfig = functions.some((f) => inferFunctionName(f) === functionName);
    const fnDir = path.join(projectRoot, 'src', 'functions', functionName);
    const inFs = fs.existsSync(fnDir);

    return {
        fileNotFound: false,
        exists: inConfig || inFs,
        projectRoot,
    };
}

