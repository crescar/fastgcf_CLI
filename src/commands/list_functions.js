import { listFunctions } from '../scripts/list/index.js';

export function registerListCommand(program) {
    program
        .command('list')
        .alias('ls')
        .option('--json', 'Output registered functions as JSON')
        .description('List all functions, routes, HTTP methods, and preHandlers registered in fastgcf.json')
        .addHelpText('after', `
Examples:
    $ fastgcf list
    $ fastgcf ls
    $ fastgcf list --json
`)
        .action(async (options) => {
            await listFunctions(options);
        });
}

export { registerListCommand as listProjectFunctions };

