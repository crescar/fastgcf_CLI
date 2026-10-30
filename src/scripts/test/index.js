import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { transformSync } from 'esbuild';
import { getProjectRootOrThrow } from '../../utils/project_context.js';
import { FastgcfError } from '../../utils/cli_error.js';

function getJestConfigPath(projectRoot) {
    const candidates = [
        path.join(projectRoot, 'jest.config.ts'),
        path.join(projectRoot, 'testing', 'jest.config.ts'),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    throw new FastgcfError('jest.config.ts not found in project root.', {
        code: 'JEST_CONFIG_NOT_FOUND',
        hint: 'Create jest.config.ts at project root or in testing/jest.config.ts.',
    });
}

async function loadBaseJestConfig(projectRoot) {
    const jestConfigPath = getJestConfigPath(projectRoot);
    const source = fs.readFileSync(jestConfigPath, 'utf-8');
    const { code } = transformSync(source, {
        loader: 'ts',
        format: 'esm',
        target: 'node22',
    });

    const tempConfigPath = path.join(projectRoot, `.fastgcf.jest.base.config.${process.pid}.mjs`);
    fs.writeFileSync(tempConfigPath, code, 'utf-8');

    try {
        const tempConfigUrl = `${pathToFileURL(tempConfigPath).href}?t=${Date.now()}`;
        const module = await import(tempConfigUrl);
        return module.default ?? module;
    } finally {
        if (fs.existsSync(tempConfigPath)) {
            fs.unlinkSync(tempConfigPath);
        }
    }
}

function normalizeStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((item) => typeof item === 'string');
}

function mapFunctionTestMatch(testMatch, functionName) {
    const fnPattern = `<rootDir>/src/functions/${functionName}/**/*.spec.ts`;
    const basePatterns = normalizeStringArray(testMatch);
    let replaced = false;

    const mapped = basePatterns.map((pattern) => {
        if (pattern.includes('<rootDir>/src/')) {
            replaced = true;
            return fnPattern;
        }
        return pattern;
    });

    if (!replaced) {
        mapped.unshift(fnPattern);
    }

    return [...new Set(mapped)];
}

function mapFunctionRoots(roots, functionName) {
    const fnRoot = `<rootDir>/src/functions/${functionName}`;
    const baseRoots = normalizeStringArray(roots);
    let replaced = false;

    const mapped = baseRoots.map((root) => {
        if (root === '<rootDir>/src') {
            replaced = true;
            return fnRoot;
        }
        return root;
    });

    if (!replaced) {
        mapped.unshift(fnRoot);
    }

    return [...new Set(mapped)];
}

async function createJestConfig(projectRoot, functionName) {
    const baseConfig = await loadBaseJestConfig(projectRoot);
    if (!functionName) {
        return baseConfig;
    }

    return {
        ...baseConfig,
        testMatch: mapFunctionTestMatch(baseConfig.testMatch, functionName),
        roots: mapFunctionRoots(baseConfig.roots, functionName),
    };
}

function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const processCommand = spawn(command, args, {
            stdio: 'inherit',
            shell: true,
            ...options,
        });

        processCommand.on('error', reject);
        processCommand.on('exit', (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(
                new FastgcfError(`Test command failed with exit code ${code}`, {
                    code: 'TEST_EXECUTION_FAILED',
                    exitCode: code,
                })
            );
        });
    });
}

function getJestExecutablePath(projectRoot) {
    const jestBinary = process.platform === 'win32' ? 'jest.cmd' : 'jest';
    return path.join(projectRoot, 'node_modules', '.bin', jestBinary);
}

async function ensureJestInstalled(projectRoot) {
    const jestExecutablePath = getJestExecutablePath(projectRoot);
    if (!fs.existsSync(jestExecutablePath)) {
        throw new FastgcfError('Jest is not installed in the project.', {
            code: 'JEST_NOT_INSTALLED',
            hint: 'Run "npm install" inside the project to install all dependencies.',
        });
    }
}

export async function runTests(functionName, options = {}) {
    const projectRoot = options.rootDir || getProjectRootOrThrow();
    const config = await createJestConfig(projectRoot, functionName);
    await ensureJestInstalled(projectRoot);

    const configPath = path.join(projectRoot, '.fastgcf.jest.config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    try {
        await runCommand('npx', ['jest', '--config', configPath], { cwd: projectRoot });
    } finally {
        if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
        }
    }
}

