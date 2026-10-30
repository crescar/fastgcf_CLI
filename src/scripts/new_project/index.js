import cliProgress from 'cli-progress';
import figlet from 'figlet';
import pc from 'picocolors';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { folderStructure } from './services/create_folder_structure.js';
import { createConfigurations } from './services/create_configurations.js';
import { createBaseRuntime } from './services/create_base_runtime.js';
import { createBaseContext } from './services/create_base_context.js';
import { createBaseWrapper } from './services/create_base_wrapper.js';
import { createBaseMiddleware } from './services/create_base_middleware.js';
import { createValidatorBaseMiddleware } from './services/validator_base_middleware.js';
import { createHandlerResponses } from './services/create_handler_responses.js';
import { createZodOpenApiUtil } from './services/create_zod_openapi_util.js';
import { createBaseDoc } from './services/create_base_doc.js';
import { assertValidProjectName } from '../../utils/cli_validation.js';
import { FastgcfError } from '../../utils/cli_error.js';

const execAsync = promisify(exec);

function createBaseGitIgnore(projectRoot) {
    const gitIgnorePath = path.join(projectRoot, '.gitignore');
    const content = ['node_modules/', 'dist/', 'coverage/', '.env', '.fastgcf.*'].join('\n') + '\n';
    fs.writeFileSync(gitIgnorePath, content, 'utf-8');
}

export async function createProject(projectName, options = {}) {
    assertValidProjectName(projectName);

    const baseDir = options.baseDir || process.cwd();
    const projectRoot = path.join(baseDir, projectName);
    if (fs.existsSync(projectRoot) && fs.readdirSync(projectRoot).length > 0) {
        throw new FastgcfError(`Directory "${projectName}" already exists and is not empty.`, {
            code: 'PROJECT_ALREADY_EXISTS',
            hint: 'Choose a different project name or run in an empty directory.',
        });
    }

    const showProgress = process.stdout.isTTY && !options.silent;
    const progressBar = showProgress
        ? new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
        : null;
    if (progressBar) {
        progressBar.start(100, 0);
    }

    try {
        folderStructure(projectName, baseDir);
        progressBar?.update(15);

        createConfigurations(projectName, baseDir);
        createBaseRuntime(projectName, baseDir);
        progressBar?.update(35);

        createBaseContext(projectName, baseDir);
        createBaseWrapper(projectName, baseDir);
        createBaseMiddleware(projectName, baseDir);
        createValidatorBaseMiddleware(projectName, baseDir);
        progressBar?.update(60);

        createHandlerResponses(projectName, baseDir);
        createZodOpenApiUtil(projectName, baseDir);
        progressBar?.update(80);

        createBaseDoc(projectName, baseDir);
        createBaseGitIgnore(projectRoot);
        progressBar?.update(90);

        if (!options.skipInstall) {
            await execAsync('git init', { cwd: projectRoot });
            await execAsync('npm install', { cwd: projectRoot });
        }

        progressBar?.update(100);
        progressBar?.stop();

        if (!options.silent) {
            const figletText = await new Promise((resolve) => {
                figlet(`Project ${projectName} Created!`, (error, data) => {
                    if (error) {
                        resolve(`Project ${projectName} Created!`);
                        return;
                    }
                    resolve(data);
                });
            });

            console.log(figletText);
            console.log(pc.green('cd into your project and start developing!'));
            console.log(pc.green(`  cd ${projectName}`));
            console.log(pc.green('  fastgcf function <function-name> to create a new function'));
            console.log(pc.green('  fastgcf prehandler <prehandler-name> to create a new preHandler'));
            console.log(pc.green('  fastgcf start to build and launch the Express runner'));
        }
    } catch (error) {
        progressBar?.stop();
        if (error instanceof FastgcfError) {
            throw error;
        }
        throw new FastgcfError(`Error creating project: ${error instanceof Error ? error.message : String(error)}`, {
            code: 'PROJECT_CREATION_FAILED',
            hint: 'Check directory permissions and npm connectivity.',
        });
    }
}

