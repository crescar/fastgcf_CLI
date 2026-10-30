import fs from 'fs';
import path from 'path';
import { builtinModules } from 'module';
import { build } from 'esbuild';
import enquirer from 'enquirer';
import pc from 'picocolors';
import { assertPathInsideProject, assertValidFunctionName } from '../../utils/cli_validation.js';
import { getProjectRootOrThrow, readFastgcfConfig } from '../../utils/project_context.js';
import { inferFunctionName } from '../../utils/string_utils.js';
import { FastgcfError } from '../../utils/cli_error.js';
import { syncFunctionConfig, syncAllFunctionsConfig } from '../../services/config/function_config_sync.js';
import { generateOpenApiBundle } from '../docs/index.js';

const NODE_BUILTINS = new Set([
    ...builtinModules,
    ...builtinModules.map((mod) => `node:${mod}`),
]);

export function normalizeBuildType(rawType) {
    if (!rawType) return null;
    const normalized = String(rawType).toLowerCase().trim();
    if (normalized === 'bundle' || normalized === 'single' || normalized === 'inlined') {
        return 'bundle';
    }
    if (normalized === 'modular' || normalized === 'standalone' || normalized === 'layers') {
        return 'modular';
    }
    return null;
}

export function extractUsedDependencies(metafile, projectRoot) {
    if (!metafile || !metafile.outputs) {
        return {};
    }

    const rootPackageJsonPath = path.join(projectRoot, 'package.json');
    let rootDependencies = {};
    let rootDevDependencies = {};

    if (fs.existsSync(rootPackageJsonPath)) {
        try {
            const rootPkg = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf-8'));
            rootDependencies = rootPkg.dependencies || {};
            rootDevDependencies = rootPkg.devDependencies || {};
        } catch {
            // Ignore
        }
    }

    const configPath = path.join(projectRoot, 'fastgcf.json');
    let serviceName = '';
    if (fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            serviceName = config.service || '';
        } catch {
            // Ignore
        }
    }

    const detectedPackageNames = new Set();

    for (const outputMeta of Object.values(metafile.outputs)) {
        const imports = outputMeta.imports || [];
        for (const item of imports) {
            const importPath = item.path;
            if (!importPath || importPath.startsWith('.') || path.isAbsolute(importPath)) {
                continue;
            }

            let packageName = '';
            if (importPath.startsWith('@')) {
                const parts = importPath.split('/');
                packageName = parts.slice(0, 2).join('/');
            } else {
                packageName = importPath.split('/')[0];
            }

            if (!packageName || NODE_BUILTINS.has(packageName) || NODE_BUILTINS.has(`node:${packageName}`)) {
                continue;
            }

            if (serviceName && packageName.startsWith(`@${serviceName}`)) {
                continue;
            }

            detectedPackageNames.add(packageName);
        }
    }

    const fnDependencies = {};
    for (const pkgName of [...detectedPackageNames].sort()) {
        const version = rootDependencies[pkgName] || rootDevDependencies[pkgName] || '*';
        fnDependencies[pkgName] = version;
    }

    return fnDependencies;
}

async function resolveBuildType(functionName, explicitType, nonInteractive = false) {
    if (explicitType) {
        const normalized = normalizeBuildType(explicitType);
        if (!normalized) {
            throw new FastgcfError(`Invalid build type "${explicitType}".`, {
                code: 'INVALID_BUILD_TYPE',
                hint: 'Supported build types are: "bundle" (single-file) or "modular" (with package.json).',
            });
        }
        return normalized;
    }

    if (process.stdin.isTTY && !nonInteractive) {
        const response = await enquirer.prompt({
            type: 'select',
            name: 'buildType',
            message: `Select build strategy for "${functionName}":`,
            choices: [
                {
                    name: 'bundle',
                    message: 'Single-file bundle (inlines all dependencies into index.js)',
                },
                {
                    name: 'modular',
                    message: 'Modular (keeps external packages + generates minimal package.json)',
                },
            ],
            initial: 0,
        });
        return response.buildType;
    }

    return 'bundle';
}

export async function buildPreHandlers(projectRoot = getProjectRootOrThrow(), options = {}) {
    const srcPreDir = path.join(projectRoot, 'src', 'preHandlers');
    if (!fs.existsSync(srcPreDir)) {
        return [];
    }

    const entries = fs.readdirSync(srcPreDir, { withFileTypes: true });
    const compiled = [];

    for (const entry of entries) {
        if (!entry.isFile() || !/\.[jt]s$/.test(entry.name) || /\.spec\.[jt]s$/.test(entry.name)) {
            continue;
        }
        const preName = entry.name.replace(/\.[jt]s$/, '');
        const entryPoint = path.join(srcPreDir, entry.name);
        const outputFile = path.join(projectRoot, 'dist', 'preHandlers', `${preName}.js`);

        fs.mkdirSync(path.dirname(outputFile), { recursive: true });
        await build({
            entryPoints: [entryPoint],
            bundle: true,
            outfile: outputFile,
            minify: true,
            platform: 'node',
            format: 'esm',
            banner: {
                js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
            },
            sourcemap: false,
        });
        compiled.push(outputFile);
        if (!options.silent) {
            console.log(pc.green(`✔ PreHandler "${preName}" compiled to dist/preHandlers/${preName}.js`));
        }
    }

    return compiled;
}

async function buildSingleFunction(functionName, projectRoot, buildType, options = {}) {
    assertValidFunctionName(functionName);
    const entryPoint = path.resolve(projectRoot, 'src', 'functions', functionName, 'index.ts');
    const outputFile = path.resolve(projectRoot, 'dist', functionName, 'index.js');

    assertPathInsideProject(projectRoot, entryPoint, 'build entry point');
    assertPathInsideProject(projectRoot, outputFile, 'build output path');

    if (!fs.existsSync(entryPoint)) {
        throw new FastgcfError(
            `Entry point not found for function "${functionName}": ${path.relative(projectRoot, entryPoint)}`,
            {
                code: 'ENTRY_POINT_NOT_FOUND',
                hint: `Ensure "src/functions/${functionName}/index.ts" exists.`,
            }
        );
    }

    syncFunctionConfig(projectRoot, functionName);
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });

    if (buildType === 'modular') {
        const result = await build({
            entryPoints: [entryPoint],
            bundle: true,
            packages: 'external',
            outfile: outputFile,
            minify: true,
            platform: 'node',
            format: 'esm',
            metafile: true,
            banner: {
                js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
            },
            sourcemap: false,
        });

        const dependencies = extractUsedDependencies(result.metafile, projectRoot);
        const distDir = path.dirname(outputFile);
        const config = readFastgcfConfig(projectRoot);
        const serviceName = config.service || 'fastgcf';

        const packageJsonContent = {
            name: `${serviceName}-${functionName}`,
            version: '1.0.0',
            type: 'module',
            main: 'index.js',
            dependencies,
        };

        const packageJsonPath = path.join(distDir, 'package.json');
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJsonContent, null, 2) + '\n', 'utf-8');

        if (!options.silent) {
            console.log(pc.green(`✔ Function "${functionName}" compiled! [Strategy: Modular]`));
            console.log(pc.cyan(`  Output: ${outputFile}`));
        }
    } else {
        await build({
            entryPoints: [entryPoint],
            bundle: true,
            outfile: outputFile,
            minify: true,
            platform: 'node',
            format: 'esm',
            banner: {
                js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
            },
            sourcemap: false,
        });

        if (!options.silent) {
            console.log(pc.green(`✔ Function "${functionName}" compiled! [Strategy: Single-file bundle]`));
            console.log(pc.cyan(`  Output: ${outputFile}`));
        }
    }
}

export async function buildProject(functionName, options = {}) {
    const projectRoot = options.rootDir || getProjectRootOrThrow();

    await buildPreHandlers(projectRoot, options);

    if (functionName === '__doc__') {
        await generateOpenApiBundle({ rootDir: projectRoot, silent: options.silent });
        return;
    }

    if (!functionName) {
        syncAllFunctionsConfig(projectRoot);
        const config = readFastgcfConfig(projectRoot);
        const fnNames = config.functions.map((f) => inferFunctionName(f));
        const buildType = await resolveBuildType('all', options.type || 'bundle', true);

        for (const name of fnNames) {
            const entry = path.join(projectRoot, 'src', 'functions', name, 'index.ts');
            if (fs.existsSync(entry)) {
                await buildSingleFunction(name, projectRoot, buildType, options);
            }
        }

        await generateOpenApiBundle({ rootDir: projectRoot, silent: options.silent });
        return;
    }

    const buildType = await resolveBuildType(functionName, options.type, options.nonInteractive);
    await buildSingleFunction(functionName, projectRoot, buildType, options);
    await generateOpenApiBundle({ rootDir: projectRoot, silent: options.silent });
}

