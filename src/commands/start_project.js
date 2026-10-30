import { runProject } from '../scripts/run_project/index.js';
import { getRegisteredFunctionNames } from '../scripts/run_project/services/function_registry.js';
import { assertValidFunctionName } from '../utils/cli_validation.js';
import { FastgcfError } from '../utils/cli_error.js';

export function registerStartCommand(program) {
    program
        .command('start [function-name]')
        .alias('dev')
        .description('Build and start the Express multi-function runner in watch mode')
        .addHelpText('after', `
Examples:
    $ fastgcf start
    $ fastgcf dev
    $ fastgcf start greeting
`)
        .action(async (functionName) => {
            if (!functionName) {
                await runProject(undefined);
                return;
            }

            assertValidFunctionName(functionName);

            const registeredFunctions = getRegisteredFunctionNames();
            if (!registeredFunctions.includes(functionName)) {
                throw new FastgcfError(`Function "${functionName}" not found in fastgcf.json.`, {
                    code: 'FUNCTION_NOT_FOUND',
                    hint: `Available functions: ${registeredFunctions.join(', ') || 'none'}`,
                });
            }

            await runProject(functionName);
        });
}

export { registerStartCommand as startProject };

