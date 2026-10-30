import { generatePreHandler } from '../scripts/prehandler/index.js';
import { assertValidPreHandlerName } from '../utils/cli_validation.js';

export function registerPreHandlerCommand(program) {
    program
        .command('prehandler <prehandler-name>')
        .alias('create-prehandler')
        .option('-f, --functions <names>', 'Comma-separated function names to attach this preHandler to')
        .description('Generate a preHandler in src/preHandlers and optionally attach it to functions in fastgcf.json')
        .addHelpText('after', `
Examples:
    $ fastgcf prehandler auth
    $ fastgcf create-prehandler rate-limit --functions greeting,users
`)
        .action(async (preHandlerName, options) => {
            assertValidPreHandlerName(preHandlerName);
            await generatePreHandler(preHandlerName, options);
        });
}

export { registerPreHandlerCommand as createPreHandler };

