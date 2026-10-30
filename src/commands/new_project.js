import { createProject } from '../scripts/new_project/index.js';

export function registerNewCommand(program) {
    program
        .command('new <project-name>')
        .alias('init')
        .option('--skip-install', 'Skip running npm install during scaffold')
        .description('Create a FastGCF project scaffold with Express runner, TypeScript, Zod & OpenAPI')
        .addHelpText('after', `
Examples:
    $ fastgcf new my-gcp-api
    $ fastgcf init orders-service
`)
        .action(async (projectName, options) => {
            await createProject(projectName, options);
        });
}

export { registerNewCommand as newProject };

