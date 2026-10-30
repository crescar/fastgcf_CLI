import { createGcfFunction } from '../scripts/create_function/index.js';

export function registerFunctionCommand(program) {
    program
        .command('function <function-name>')
        .alias('create-function')
        .option('-m, --method <method>', 'HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS, ALL)')
        .option('-p, --path <path>', 'Route path (e.g. v1/users)')
        .option('--prehandler <names>', 'Comma-separated preHandler names to attach')
        .description('Generate a new function with TypeScript handler, Zod schemas, tests, docs, and fastgcf.json entry')
        .addHelpText('after', `
Examples:
    $ fastgcf function greeting
    $ fastgcf create-function users-list
    $ fastgcf function create-user --method POST --path v1/users
`)
        .action(async (functionName, options) => {
            await createGcfFunction(functionName, options);
        });
}

export { registerFunctionCommand as newFunction };

