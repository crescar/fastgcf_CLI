import { dropGcfFunction } from '../scripts/drop_function/index.js';

export function registerDropCommand(program) {
    program
        .command('drop <function-name>')
        .alias('remove')
        .option('-y, --yes', 'Skip interactive confirmation prompt')
        .description('Remove a function from the project (source, dist, docs, and fastgcf.json entry)')
        .addHelpText('after', `
Examples:
    $ fastgcf drop greeting
    $ fastgcf remove users-create --yes
`)
        .action(async (functionName, options) => {
            await dropGcfFunction(functionName, options);
        });
}

export { registerDropCommand as dropFunction };

