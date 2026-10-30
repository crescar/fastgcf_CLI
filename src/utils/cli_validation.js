import path from 'path';
import { FastgcfError } from './cli_error.js';

const SAFE_IDENTIFIER_REGEX = /^[A-Za-z0-9_-]+$/;

export function assertValidProjectName(projectName) {
    if (typeof projectName !== 'string' || !projectName.trim()) {
        throw new FastgcfError('Project name is required.', {
            code: 'INVALID_PROJECT_NAME',
            hint: 'Use: fastgcf new <project-name>',
        });
    }

    if (!SAFE_IDENTIFIER_REGEX.test(projectName)) {
        throw new FastgcfError(
            `Invalid project name "${projectName}". Only letters, numbers, _ and - are allowed.`,
            {
                code: 'INVALID_PROJECT_NAME',
                hint: 'Avoid spaces, slashes and special characters in project names.',
            }
        );
    }
}

export function assertValidFunctionName(functionName) {
    if (typeof functionName !== 'string' || !functionName.trim()) {
        throw new FastgcfError('Function name is required.', {
            code: 'INVALID_FUNCTION_NAME',
            hint: 'Use: fastgcf <command> <function-name>',
        });
    }

    if (!SAFE_IDENTIFIER_REGEX.test(functionName)) {
        throw new FastgcfError(
            `Invalid function name "${functionName}". Only letters, numbers, _ and - are allowed.`,
            {
                code: 'INVALID_FUNCTION_NAME',
                hint: 'Avoid spaces, slashes and dots in function names.',
            }
        );
    }
}

export function assertValidPreHandlerName(preHandlerName) {
    if (typeof preHandlerName !== 'string' || !preHandlerName.trim()) {
        throw new FastgcfError('PreHandler name is required.', {
            code: 'INVALID_PREHANDLER_NAME',
            hint: 'Use: fastgcf prehandler <prehandler-name>',
        });
    }

    if (!SAFE_IDENTIFIER_REGEX.test(preHandlerName)) {
        throw new FastgcfError(
            `Invalid preHandler name "${preHandlerName}". Only letters, numbers, _ and - are allowed.`,
            {
                code: 'INVALID_PREHANDLER_NAME',
                hint: 'Avoid spaces, slashes and special characters in preHandler names.',
            }
        );
    }
}

export function assertPathInsideProject(projectRoot, targetPath, label = 'path') {
    const normalizedRoot = path.resolve(projectRoot);
    const normalizedTarget = path.resolve(targetPath);
    const rootPrefix = normalizedRoot.endsWith(path.sep)
        ? normalizedRoot
        : `${normalizedRoot}${path.sep}`;

    if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(rootPrefix)) {
        throw new FastgcfError(`Unsafe ${label} outside project root: ${normalizedTarget}`, {
            code: 'UNSAFE_PATH',
            hint: 'Check command arguments and project structure.',
        });
    }
}

