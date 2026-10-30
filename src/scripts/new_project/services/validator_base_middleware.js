import fs from 'fs';
import path from 'path';

export function createValidatorBaseMiddleware(projectName, baseDir = process.cwd()) {
    const issueTemplate = "`${issue.path.join('.')}: ${issue.message}`";
    const content = `import type { Response } from "express";
import { HandlerMiddleware } from "../wrappers/handlerResponse.wrapper";
import { HandlerErrorResponse } from "../utils/handlerErrorResponse.util";
import type { FastgcfContext } from "../context/fastgcfContext";
import type { ZodType } from "zod";

export enum ValidationOptions {
    BODY = "BODY",
    QUERYPARAMS = "QUERYPARAMS",
    PATHPARAMS = "PATHPARAMS",
    HEADERS = "HEADERS",
}

export interface ValidatorMiddlewareMeta {
    __fastgcfValidator: true;
    schema: ZodType;
    option: ValidationOptions;
}

export function validatorMiddleware(
    schema: ZodType,
    option: ValidationOptions = ValidationOptions.BODY
): HandlerMiddleware & { __fastgcfValidator?: ValidatorMiddlewareMeta } {
    const middleware: HandlerMiddleware & { __fastgcfValidator?: ValidatorMiddlewareMeta } = async (
        event: FastgcfContext,
        _res: Response | undefined,
        next
    ) => {
        let dataToValidate: unknown;
        switch (option) {
            case ValidationOptions.BODY:
                if (typeof event.body === "string") {
                    try {
                        dataToValidate = event.body.trim() ? JSON.parse(event.body) : {};
                    } catch {
                        throw new HandlerErrorResponse(400, "Invalid JSON in request body");
                    }
                } else {
                    dataToValidate = event.body ?? {};
                }
                break;
            case ValidationOptions.QUERYPARAMS:
                dataToValidate = event.query || {};
                break;
            case ValidationOptions.PATHPARAMS:
                dataToValidate = event.params || {};
                break;
            case ValidationOptions.HEADERS:
                dataToValidate = event.headers || {};
                break;
            default:
                dataToValidate = event.body ?? {};
        }

        const result = schema.safeParse(dataToValidate);
        if (!result.success) {
            const errors = result.error.issues.map((issue) => ${issueTemplate});
            throw new HandlerErrorResponse(400, "Invalid request", errors);
        }
        return await next();
    };

    middleware.__fastgcfValidator = {
        __fastgcfValidator: true,
        schema,
        option,
    };

    return middleware;
}
`;

    const middlewareDir = path.join(baseDir, projectName, 'libs', 'common', 'middlewares');
    fs.mkdirSync(middlewareDir, { recursive: true });
    fs.writeFileSync(path.join(middlewareDir, 'validator.middleware.ts'), content, 'utf-8');
}

