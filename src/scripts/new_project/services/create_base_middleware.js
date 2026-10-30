import fs from 'fs';
import path from 'path';

export function createBaseMiddleware(projectName, baseDir = process.cwd()) {
    const loggingContent = `import type { Response } from "express";
import { HandlerMiddleware } from "../wrappers/handlerResponse.wrapper";
import { HandlerErrorResponse } from "../utils/handlerErrorResponse.util";
import type { FastgcfContext } from "../context/fastgcfContext";

export function loggingMiddleware(): HandlerMiddleware {
    return async (
        event: FastgcfContext,
        res: Response | undefined,
        next
    ) => {
        const start = Date.now();
        console.log(
            JSON.stringify({
                level: "info",
                message: "Request received",
                method: event.method,
                path: event.path,
            })
        );

        try {
            const result = await next();
            console.log(
                JSON.stringify({
                    level: "info",
                    message: "Request completed",
                    method: event.method,
                    path: event.path,
                    statusCode: result.statusCode,
                    durationMs: Date.now() - start,
                })
            );
            return result;
        } catch (error) {
            console.error(
                JSON.stringify({
                    level: "error",
                    message: "Request failed",
                    method: event.method,
                    path: event.path,
                    durationMs: Date.now() - start,
                    error: error instanceof Error ? error.message : String(error),
                })
            );

            throw error instanceof HandlerErrorResponse
                ? error
                : new HandlerErrorResponse(500, "Internal error");
        }
    };
}
`;

    const middlewareDir = path.join(baseDir, projectName, 'libs', 'common', 'middlewares');
    fs.mkdirSync(middlewareDir, { recursive: true });
    fs.writeFileSync(path.join(middlewareDir, 'logging.middleware.ts'), loggingContent, 'utf-8');

    const basePreHandlerContent = `import type { Request, Response, NextFunction } from "express";

export function preHandler(req: Request, _res: Response, next: NextFunction): void {
    console.log(\`[PreHandler] \${req.method} \${req.path}\`);
    next();
}

export default preHandler;
`;
    const preHandlersDir = path.join(baseDir, projectName, 'src', 'preHandlers');
    fs.mkdirSync(preHandlersDir, { recursive: true });
    fs.writeFileSync(path.join(preHandlersDir, 'preHandler.ts'), basePreHandlerContent, 'utf-8');
}

