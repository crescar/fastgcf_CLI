export class FastgcfError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'FastgcfError';
        this.code = options.code ?? 'FASTGCF_ERROR';
        this.hint = options.hint;
        this.exitCode = options.exitCode ?? 1;
    }
}

export function asFastgcfError(error) {
    if (error instanceof FastgcfError) {
        return error;
    }

    // Handle user cancellation in interactive prompts (e.g. Enquirer Ctrl+C)
    if (!error || error === '' || error?.name === 'ExitPromptError') {
        return new FastgcfError('Operation cancelled by user.', {
            code: 'OPERATION_CANCELLED',
            hint: 'Command aborted.',
            exitCode: 0,
        });
    }

    return new FastgcfError(
        error instanceof Error ? error.message : String(error),
        {
            code: 'UNEXPECTED_ERROR',
            hint: 'Run the command again with valid inputs and project context.',
            exitCode: 1,
        }
    );
}

