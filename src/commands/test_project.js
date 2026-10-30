import { runTests } from '../scripts/test/index.js';
import { getRegisteredFunctionNames } from '../scripts/run_project/services/function_registry.js';
import { assertValidFunctionName } from '../utils/cli_validation.js';
import { FastgcfError } from '../utils/cli_error.js';

export function registerTestCommand(program) {
    program
        .command('test [function-name]')
        .alias('spec')
        .description('Run tests for one function or for the entire project')
        .addHelpText('after', `
Examples:
    $ fastgcf test
    $ fastgcf spec
    $ fastgcf test greeting
`)
        .action(async (functionName) => {
            if (!functionName) {
                console.log('No function name provided. Running all project tests.');
                await runTests(undefined);
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

            console.log(`Running tests for function: ${functionName}`);
            await runTests(functionName);
        });
}

export { registerTestCommand as testProject };

