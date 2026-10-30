#!/usr/bin/env node
import fs from 'fs';
import { program } from 'commander';
import pc from 'picocolors';
import { registerNewCommand } from '../src/commands/new_project.js';
import { registerFunctionCommand } from '../src/commands/new_function.js';
import { registerPreHandlerCommand } from '../src/commands/create_prehandler.js';
import { registerDropCommand } from '../src/commands/drop_function.js';
import { registerBuildCommand } from '../src/commands/build_project.js';
import { registerStartCommand } from '../src/commands/start_project.js';
import { registerDocsCommand } from '../src/commands/docs_project.js';
import { registerListCommand } from '../src/commands/list_functions.js';
import { registerTestCommand } from '../src/commands/test_project.js';
import { asFastgcfError } from '../src/utils/cli_error.js';

const packageJson = JSON.parse(
    fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
);

program
    .name('fastgcf')
    .description('CLI to create, build, document, test, and run FastGCF multi-function GCP projects')
    .version(packageJson.version ?? '1.0.0')
    .showHelpAfterError('\nUse --help to see usage examples.')
    .addHelpText('after', `
Quick examples:
    $ fastgcf new my-gcp-api
    $ fastgcf function greeting
    $ fastgcf prehandler auth
    $ fastgcf build
    $ fastgcf build greeting
    $ fastgcf start
    $ fastgcf docs
    $ fastgcf list
    $ fastgcf test
    $ fastgcf drop greeting
`);

registerNewCommand(program);
registerFunctionCommand(program);
registerPreHandlerCommand(program);
registerBuildCommand(program);
registerStartCommand(program);
registerDocsCommand(program);
registerListCommand(program);
registerTestCommand(program);
registerDropCommand(program);

try {
    await program.parseAsync(process.argv);
} catch (error) {
    const cliError = asFastgcfError(error);
    if (cliError.code === 'OPERATION_CANCELLED') {
        console.log(pc.yellow(`\n${cliError.message}`));
        process.exit(0);
    }
    console.error(pc.red(`[${cliError.code}] ${cliError.message}`));
    if (cliError.hint) {
        console.error(pc.yellow(`Hint: ${cliError.hint}`));
    }
    process.exit(cliError.exitCode ?? 1);
}

