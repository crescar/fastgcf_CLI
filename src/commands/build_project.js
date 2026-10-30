import { buildProject } from '../scripts/build/index.js';

export function registerBuildCommand(program) {
    program
        .command('build [function-name]')
        .alias('compile')
        .option('-t, --type <strategy>', 'Build strategy: "bundle" (single-file) or "modular" (with package.json)')
        .description('Compile one function (or all functions + preHandlers + OpenAPI docs) to dist/ using esbuild')
        .addHelpText('after', `
Examples:
    $ fastgcf build
    $ fastgcf build greeting
    $ fastgcf build greeting --type bundle
    $ fastgcf build greeting --type modular
    $ fastgcf compile users-create -t modular
`)
        .action(async (functionName, options) => {
            await buildProject(functionName, { type: options.type });
        });
}

export { registerBuildCommand as buildProjectCommand };

