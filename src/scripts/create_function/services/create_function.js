import fs from 'fs';
import path from 'path';
import { assertPathInsideProject, assertValidFunctionName } from '../../../utils/cli_validation.js';
import { getProjectRootOrThrow } from '../../../utils/project_context.js';
import { normalizeRoutePath, toCamelCase } from '../../../utils/string_utils.js';
import { normalizePreHandlerDistPath } from './update_fastgcf_json.js';

const createFolderStructure = (functionName, rootDir = null) => {
    assertValidFunctionName(functionName);
    const projectRoot = rootDir || getProjectRootOrThrow();
    const fnDir = path.join(projectRoot, 'src', 'functions', functionName);
    const schemasDir = path.join(fnDir, 'schemas');
    const servicesDir = path.join(fnDir, 'services');
    const testDir = path.join(fnDir, '__tests__');

    assertPathInsideProject(projectRoot, fnDir, 'function directory');

    fs.mkdirSync(fnDir, { recursive: true });
    fs.mkdirSync(schemasDir, { recursive: true });
    fs.mkdirSync(servicesDir, { recursive: true });
    fs.mkdirSync(testDir, { recursive: true });
    return { projectRoot, fnDir, schemasDir, servicesDir, testDir };
};

const getProjectName = (rootDir = null) => {
    const projectRoot = rootDir || getProjectRootOrThrow();
    const configPath = path.join(projectRoot, 'fastgcf.json');
    if (fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (config.service) return config.service;
        } catch {
            // Ignore
        }
    }
    const pkgPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            if (pkg.name) return pkg.name;
        } catch {
            // Ignore
        }
    }
    return path.basename(projectRoot);
};

export function buildMethodValidationTemplate(cleanPath, upperMethod) {
    const braceMatches = [...String(cleanPath).matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    const colonMatches = [...String(cleanPath).matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1]);
    const pathParamNames = [...new Set([...braceMatches, ...colonMatches])];
    const hasPathParams = pathParamNames.length > 0;

    const pathParamsSchemaBlock = hasPathParams
        ? `export const RequestPathParamsSchema = z.object({\n${pathParamNames
              .map(
                  (p) =>
                      `    ${p}: z.string().optional().describe("Path parameter ${p}").meta({ example: "123" }),`
              )
              .join('\n')}\n});\n\n`
        : '';

    switch (upperMethod) {
        case 'POST':
        case 'PUT':
        case 'PATCH': {
            const schemaDeclaration = `${pathParamsSchemaBlock}export const RequestBodySchema = z.object({
    name: z
        .string()
        .optional()
        .describe("Payload name for ${upperMethod} request")
        .meta({ example: "John Doe" }),
});

export type RequestBody = z.infer<typeof RequestBodySchema>;`;

            const serviceExtraction = `    const body = event.getJsonBody<RequestBody>();
    const name = body?.name || "World";`;

            const middlewareLines = [
                ...(hasPathParams
                    ? ['    validatorMiddleware(RequestPathParamsSchema, ValidationOptions.PATHPARAMS),']
                    : []),
                '    validatorMiddleware(RequestBodySchema, ValidationOptions.BODY),',
            ].join('\n');

            const schemaImports = [
                ...(hasPathParams ? ['RequestPathParamsSchema'] : []),
                'RequestBodySchema',
            ];
            const serviceTypeImports = ['RequestBody'];

            return {
                schemaDeclaration,
                serviceExtraction,
                middlewareLines,
                schemaImports,
                serviceTypeImports,
            };
        }

        case 'DELETE': {
            const paramsList = hasPathParams ? pathParamNames : ['id'];
            const firstParam = paramsList[0];
            const schemaDeclaration = `export const RequestPathParamsSchema = z.object({
${paramsList
    .map(
        (p) =>
            `    ${p}: z.string().optional().describe("Identifier ${p} of resource to delete").meta({ example: "123" }),`
    )
    .join('\n')}
});`;

            const serviceExtraction = `    const name = event.getPathParam("${firstParam}", "World");`;
            const middlewareLines = `    validatorMiddleware(RequestPathParamsSchema, ValidationOptions.PATHPARAMS),`;
            const schemaImports = ['RequestPathParamsSchema'];
            const serviceTypeImports = [];

            return {
                schemaDeclaration,
                serviceExtraction,
                middlewareLines,
                schemaImports,
                serviceTypeImports,
            };
        }

        case 'HEAD':
        case 'OPTIONS': {
            const schemaDeclaration = `export const RequestHeadersSchema = z.object({
    "x-client-name": z
        .string()
        .optional()
        .describe("Optional client identifier header")
        .meta({ example: "fastgcf-web-client" }),
});`;

            const serviceExtraction = `    const name = event.getHeader("x-client-name") || "World";`;
            const middlewareLines = `    validatorMiddleware(RequestHeadersSchema, ValidationOptions.HEADERS),`;
            const schemaImports = ['RequestHeadersSchema'];
            const serviceTypeImports = [];

            return {
                schemaDeclaration,
                serviceExtraction,
                middlewareLines,
                schemaImports,
                serviceTypeImports,
            };
        }

        case 'GET':
        default: {
            const schemaDeclaration = `${pathParamsSchemaBlock}export const RequestQuerySchema = z.object({
    name: z
        .string()
        .optional()
        .describe("Optional name query parameter")
        .meta({ example: "John Doe" }),
});`;

            const serviceExtraction = `    const name = event.getQueryParam("name", "World");`;
            const middlewareLines = [
                ...(hasPathParams
                    ? ['    validatorMiddleware(RequestPathParamsSchema, ValidationOptions.PATHPARAMS),']
                    : []),
                '    validatorMiddleware(RequestQuerySchema, ValidationOptions.QUERYPARAMS),',
            ].join('\n');
            const schemaImports = [
                ...(hasPathParams ? ['RequestPathParamsSchema'] : []),
                'RequestQuerySchema',
            ];
            const serviceTypeImports = [];

            return {
                schemaDeclaration,
                serviceExtraction,
                middlewareLines,
                schemaImports,
                serviceTypeImports,
            };
        }
    }
}

function buildPreHandlerBlocks(rawPreHandlers = []) {
    const distPaths = (Array.isArray(rawPreHandlers) ? rawPreHandlers : [])
        .map(normalizePreHandlerDistPath)
        .filter(Boolean);

    const imports = [];
    const identifiers = [];

    for (const distPath of distPaths) {
        const baseName = path.basename(distPath, '.js');
        const id = toCamelCase(baseName) || 'preHandler';
        imports.push(`import ${id} from "../../preHandlers/${baseName}";`);
        identifiers.push(id);
    }

    const preImportsBlock = imports.length > 0 ? `\n${imports.join('\n')}` : '';
    const eventPreHandlersLine =
        distPaths.length > 0
            ? `\n            preHandlers: [${distPaths.map((p) => `"${p}"`).join(', ')}],`
            : '';
    const topPreHandlersLine =
        identifiers.length > 0
            ? `\n        preHandlers: [${identifiers.join(', ')}],`
            : '';

    return {
        preImportsBlock,
        eventPreHandlersLine,
        topPreHandlersLine,
    };
}

export const createFunctionFiles = (
    functionName,
    functionPath = `v1/${functionName}`,
    method = 'get',
    options = {}
) => {
    let resolvedOptions = options || {};
    let resolvedPath = functionPath;
    let resolvedMethod = method;
    if (functionPath && typeof functionPath === 'object') {
        resolvedOptions = functionPath;
        resolvedPath = resolvedOptions.pathUrl || `v1/${functionName}`;
        resolvedMethod = resolvedOptions.method || 'get';
    }

    const folders = createFolderStructure(functionName, resolvedOptions.rootDir || null);
    const { projectRoot, fnDir, schemasDir, servicesDir, testDir } = folders;
    const projectName = getProjectName(projectRoot);
    const cleanPath = normalizeRoutePath(resolvedPath || `v1/${functionName}`);
    const upperMethod = String(resolvedMethod || 'get').toUpperCase();

    const {
        schemaDeclaration,
        serviceExtraction,
        middlewareLines,
        schemaImports,
        serviceTypeImports,
    } = buildMethodValidationTemplate(cleanPath, upperMethod);

    const {
        preImportsBlock,
        eventPreHandlersLine,
        topPreHandlersLine,
    } = buildPreHandlerBlocks(resolvedOptions.preHandlers || ['dist/preHandlers/preHandler.js']);

    const schemasContent = `import { z } from "zod";
import "@${projectName}/common/utils/zodOpenApi.util";

// 1. Request Validation Schemas (use .meta({ example }) to populate Swagger UI examples)
${schemaDeclaration}

// 2. Success Response Schema (200)
export const GreetingResponseSchema = z.object({
    greeting: z
        .string()
        .describe("Greeting response message")
        .meta({ example: "Hello, John Doe! from function ${functionName}" }),
});

export type GreetingData = z.infer<typeof GreetingResponseSchema>;

// 3. Error Response Schemas (for Swagger/OpenAPI error documentation)
export const BadRequestErrorSchema = z.object({
    message: z
        .string()
        .describe("Validation or bad request summary")
        .meta({ example: "Invalid request parameters" }),
    error: z
        .array(z.string())
        .describe("Detailed validation issues")
        .meta({ example: ["name: Invalid input"] }),
});

export const InternalServerErrorSchema = z.object({
    message: z
        .string()
        .describe("Unexpected server error message")
        .meta({ example: "An unexpected error occurred" }),
    error: z
        .string()
        .describe("Technical error detail")
        .meta({ example: "Database connection timeout" }),
});
`;
    fs.writeFileSync(path.join(schemasDir, 'index.ts'), schemasContent, 'utf-8');

    const schemaTypesList = ['GreetingData', ...serviceTypeImports].join(', ');

    const servicesContent = `import { HandlerStandardResponse } from "@${projectName}/common/utils/handlerStandardResponse.util";
import { HandlerErrorResponse } from "@${projectName}/common/utils/handlerErrorResponse.util";
import type { FastgcfContext } from "@${projectName}/common/context/fastgcfContext";
import type { ${schemaTypesList} } from "../schemas";

export async function service(
    event: FastgcfContext
): Promise<HandlerStandardResponse<GreetingData>> {
${serviceExtraction}

    return new HandlerStandardResponse<GreetingData>(200, {
        message: "Request successful",
        status: "success",
        data: {
            greeting: \`Hello, \${name}! from function ${functionName}\`,
        },
    });
}
`;
    fs.writeFileSync(path.join(servicesDir, 'index.ts'), servicesContent, 'utf-8');

    const importedSchemas = [
        ...schemaImports,
        'GreetingResponseSchema',
        'BadRequestErrorSchema',
        'InternalServerErrorSchema',
    ].join(',\n    ');

    const indexContent = `import {
    handlerResponse
} from "@${projectName}/common/wrappers/handlerResponse.wrapper";
import {
    validatorMiddleware,
    ValidationOptions,
} from "@${projectName}/common/middlewares/validator.middleware";
import {
    ${importedSchemas},
} from "./schemas";
import { service } from "./services";${preImportsBlock}

export const handler = handlerResponse(
    {
        event: {
            method: "${upperMethod}",
            path: "${cleanPath}",${eventPreHandlersLine}
        },${topPreHandlersLine}
        doc: {
            summary: "Basic ${functionName} function",
            description: "Auto-documented FastGCF endpoint for ${functionName}.",
            tags: ["${functionName.toUpperCase()}"],
            response: GreetingResponseSchema,
            errors: {
                400: {
                    description: "Bad Request / Validation Error",
                    schema: BadRequestErrorSchema,
                },
                500: {
                    description: "Internal Server Error",
                    schema: InternalServerErrorSchema,
                },
            },
        },
    },
${middlewareLines}
    service
);

export default handler;
`;
    fs.writeFileSync(path.join(fnDir, 'index.ts'), indexContent, 'utf-8');

    const indexTestContent = `import handler from "../index";

describe("${functionName} function", () => {
    it("should return a successful greeting response", async () => {
        const mockReq = {
            method: "${upperMethod}",
            path: "/${cleanPath}",
            headers: {},
            query: {},
            params: {},
            body: {},
        };
        const response = await handler(mockReq);
        expect(response.statusCode).toBe(200);
        expect(response.responseBody).toBeDefined();
        expect(response.responseBody).toHaveProperty("message", "Request successful");
        expect(response.responseBody).toHaveProperty("status", "success");
        expect(response.responseBody.data).toHaveProperty(
            "greeting",
            "Hello, World! from function ${functionName}"
        );
    });
});
`;
    fs.writeFileSync(path.join(testDir, 'index.spec.ts'), indexTestContent, 'utf-8');
};
