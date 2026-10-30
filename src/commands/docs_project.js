import { generateOpenApiBundle } from '../scripts/docs/index.js';

export function registerDocsCommand(program) {
    program
        .command('docs')
        .alias('openapi')
        .description('Generate OpenAPI 3.0 specification (dist/openapi.json) from registered functions and Zod schemas')
        .addHelpText('after', `
Examples:
    $ fastgcf docs
    $ fastgcf openapi
`)
        .action(async () => {
            await generateOpenApiBundle();
        });
}

export { registerDocsCommand as docsProject };

