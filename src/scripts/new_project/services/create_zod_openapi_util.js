import fs from 'fs';
import path from 'path';

export function createZodOpenApiUtil(projectName, baseDir = process.cwd()) {
    const content = `// Mark doc generation mode so importing handlers does not trigger eagerInit connections
(globalThis as any).__FASTGCF_DOC_MODE__ = true;

import { z, type ZodType } from "zod";
import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import { ValidationOptions } from "../middlewares/validator.middleware";

try {
  extendZodWithOpenApi(z);
} catch {
  // Ignore if already extended or using a stubbed z in unit tests
}

// Polyfill .meta({ example, description }) on ZodType so FastLBS-style .meta() and .openapi() both work
if ((z as any)?.ZodType?.prototype && typeof (z as any).ZodType.prototype.meta !== "function") {
  (z as any).ZodType.prototype.meta = function (metaObj: Record<string, any>) {
    if (typeof this.openapi === "function") {
      return this.openapi(metaObj);
    }
    return this;
  };
}

export function cleanJsonSchemaForOpenApi(schemaObj: any): any {
  if (!schemaObj || typeof schemaObj !== "object") {
    return schemaObj;
  }

  if (Array.isArray(schemaObj)) {
    return schemaObj.map((item) => cleanJsonSchemaForOpenApi(item));
  }

  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(schemaObj)) {
    if (key === "$schema") {
      continue;
    }
    cleaned[key] = cleanJsonSchemaForOpenApi(value);
  }
  return cleaned;
}

/**
 * Converts a Zod schema into an OpenAPI 3.0 compatible Schema Object using
 * @asteasolutions/zod-to-openapi (or z.toJSONSchema fallback).
 */
export function zodToOpenApiSchema(schema?: ZodType | any): Record<string, any> | undefined {
  if (!schema) {
    return undefined;
  }

  if (schema._jsonSchema && typeof schema._jsonSchema === "object") {
    return cleanJsonSchemaForOpenApi(schema._jsonSchema);
  }

  try {
    if (typeof (z as any).toJSONSchema === "function") {
      const rawJsonSchema = (z as any).toJSONSchema(schema);
      return cleanJsonSchemaForOpenApi(rawJsonSchema);
    }
  } catch {
    // Fallback to OpenAPIRegistry below
  }

  try {
    const registry = new OpenAPIRegistry();
    const registered = registry.register("TempSchema", schema);
    const generator = new OpenApiGeneratorV3(registry.definitions);
    const components = generator.generateComponents();
    const generated = components.components?.schemas?.TempSchema;
    if (generated && typeof generated === "object") {
      return cleanJsonSchemaForOpenApi(generated);
    }
  } catch {
    // Fallback if schema cannot be converted
  }

  return { type: "object" };
}

/**
 * Converts an object-based Zod schema into an array of OpenAPI 3.0 Parameter Objects
 * for query, path, or header locations.
 */
export function zodToOpenApiParameters(
  schema: ZodType | any,
  location: "query" | "path" | "header"
): Array<Record<string, any>> {
  const jsonSchema = zodToOpenApiSchema(schema);
  if (!jsonSchema || jsonSchema.type !== "object" || !jsonSchema.properties) {
    return [];
  }

  const requiredFields = new Set<string>(
    Array.isArray(jsonSchema.required) ? jsonSchema.required : []
  );

  const parameters: Array<Record<string, any>> = [];

  for (const [propName, propSchema] of Object.entries<any>(jsonSchema.properties)) {
    const { description, example, ...restSchema } = propSchema || {};
    parameters.push({
      name: propName,
      in: location,
      required: location === "path" ? true : requiredFields.has(propName),
      ...(description ? { description } : {}),
      ...(example !== undefined ? { example } : {}),
      schema:
        Object.keys(restSchema).length > 0
          ? { ...restSchema, ...(example !== undefined ? { example } : {}) }
          : { type: "string", ...(example !== undefined ? { example } : {}) },
    });
  }

  return parameters;
}

const DEFAULT_ERROR_DESCRIPTIONS: Record<string, string> = {
  "400": "Bad Request / Validation Error",
  "401": "Unauthorized",
  "403": "Forbidden",
  "404": "Resource Not Found",
  "409": "Conflict",
  "422": "Unprocessable Entity",
  "429": "Too Many Requests",
  "500": "Internal Server Error",
};

function isZodSchema(value: any): value is ZodType {
  return Boolean(
    value &&
      typeof value === "object" &&
      (typeof value.safeParse === "function" || "_def" in value || "_zod" in value || "_jsonSchema" in value)
  );
}

function buildErrorResponses(
  errorsConfig?: Record<string | number, any>
): Record<string, any> {
  const errorResponses: Record<string, any> = {
    "400": {
      description: "Validation / Bad Request Error",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              message: { type: "string", example: "Invalid request" },
              error: {
                type: "array",
                items: { type: "string" },
                example: ["field: Required"],
              },
            },
          },
        },
      },
    },
    "500": {
      description: "Internal Server Error",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              message: { type: "string", example: "An unexpected error occurred" },
              error: { type: "string", example: "Unexpected runtime error" },
            },
          },
        },
      },
    },
  };

  if (!errorsConfig || typeof errorsConfig !== "object") {
    return errorResponses;
  }

  for (const [rawCode, errorEntry] of Object.entries(errorsConfig)) {
    if (!errorEntry) continue;
    const code = String(rawCode);
    const directSchema = isZodSchema(errorEntry) ? errorEntry : errorEntry.schema;
    const openApiErrorSchema = zodToOpenApiSchema(directSchema);
    if (!openApiErrorSchema) continue;

    const customDescription =
      (!isZodSchema(errorEntry) && errorEntry.description) ||
      openApiErrorSchema.description ||
      DEFAULT_ERROR_DESCRIPTIONS[code] ||
      \`Error response (\${code})\`;

    errorResponses[code] = {
      description: customDescription,
      content: {
        "application/json": {
          schema: openApiErrorSchema,
        },
      },
    };
  }

  return errorResponses;
}

function normalizeOpenApiPath(rawPath: string): string {
  const trimmed = rawPath.trim().replace(/^\\/+/, "");
  const withBraces = trimmed.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
  return \`/\${withBraces}\`;
}

function extractHttpEvents(
  optionsEvent: any,
  functionEntry: any,
  functionName: string
): Array<{ method: string; path: string; hasAuthPreHandler?: boolean }> {
  const httpEvents: Array<{ method: string; path: string; hasAuthPreHandler?: boolean }> = [];

  const preHandlersList: string[] = Array.isArray(functionEntry?.preHandlers)
    ? functionEntry.preHandlers
    : [];
  const hasEntryAuth = preHandlersList.some((p) => /auth/i.test(String(p)));

  const rawEvents = optionsEvent
    ? Array.isArray(optionsEvent)
      ? optionsEvent
      : [optionsEvent]
    : [];

  for (const evt of rawEvents) {
    if (!evt || typeof evt !== "object") continue;
    const rawPath = evt.path || evt.http?.path || functionEntry?.path;
    const rawMethod = evt.method || evt.http?.method || functionEntry?.methods;
    if (!rawPath) continue;

    const methodsList = Array.isArray(rawMethod)
      ? rawMethod
      : rawMethod
      ? [rawMethod]
      : ["get"];

    const evtPreHandlers = Array.isArray(evt.preHandlers) ? evt.preHandlers : [];
    const hasAuth =
      hasEntryAuth ||
      Boolean(evt.authorizer) ||
      evtPreHandlers.some((p: string) => /auth/i.test(String(p)));

    for (const m of methodsList) {
      const normalizedMethod = String(m).toLowerCase();
      httpEvents.push({
        method: normalizedMethod === "all" ? "get" : normalizedMethod,
        path: normalizeOpenApiPath(String(rawPath)),
        hasAuthPreHandler: hasAuth,
      });
    }
  }

  if (httpEvents.length > 0) {
    return httpEvents;
  }

  if (functionEntry && functionEntry.path) {
    const methods =
      Array.isArray(functionEntry.methods) && functionEntry.methods.length > 0
        ? functionEntry.methods
        : ["GET"];
    for (const m of methods) {
      const normalizedMethod = String(m).toLowerCase();
      httpEvents.push({
        method: normalizedMethod === "all" ? "get" : normalizedMethod,
        path: normalizeOpenApiPath(String(functionEntry.path)),
        hasAuthPreHandler: hasEntryAuth,
      });
    }
  } else {
    httpEvents.push({
      method: "get",
      path: normalizeOpenApiPath(\`v1/\${functionName}\`),
      hasAuthPreHandler: false,
    });
  }

  return httpEvents;
}

/**
 * Introspects a FastGCF handler (its attached validatorMiddleware Zod schemas,
 * event configuration, doc options, or exported schema object) to build an OpenAPI 3.0 Path item.
 */
export function extractOpenApiFromHandler(
  functionName: string,
  handlerOrModule: any,
  functionEntry?: any,
  manualOverrides?: Record<string, any>
): Record<string, any> {
  const resolvedHandler =
    typeof handlerOrModule === "function"
      ? handlerOrModule
      : handlerOrModule?.default ?? handlerOrModule?.handler;

  const exportedSchema =
    handlerOrModule?.schema ?? resolvedHandler?.schema ?? {};

  const metadata =
    resolvedHandler?.__fastgcfMetadata ||
    resolvedHandler?.__fastlbsMetadata ||
    {};
  const options = metadata.options || {};
  const validators: Array<{ schema: ZodType; option: ValidationOptions }> =
    Array.isArray(metadata.validators) ? [...metadata.validators] : [];

  if (exportedSchema.body) {
    validators.push({ schema: exportedSchema.body, option: ValidationOptions.BODY });
  }
  if (exportedSchema.query) {
    validators.push({ schema: exportedSchema.query, option: ValidationOptions.QUERYPARAMS });
  }
  if (exportedSchema.params) {
    validators.push({ schema: exportedSchema.params, option: ValidationOptions.PATHPARAMS });
  }
  if (exportedSchema.headers) {
    validators.push({ schema: exportedSchema.headers, option: ValidationOptions.HEADERS });
  }

  const httpEvents = extractHttpEvents(options.event, functionEntry, functionName);
  if (httpEvents.length === 0) {
    return manualOverrides ? { ...manualOverrides } : {};
  }

  const hasAuthConfigured =
    Boolean(options.authorizer) ||
    httpEvents.some((e) => e.hasAuthPreHandler);

  const docConfig = {
    ...exportedSchema,
    ...(options.doc || {}),
  };

  const summary =
    docConfig.summary || \`\${functionName} endpoint\`;
  const description =
    docConfig.description || \`Auto-generated OpenAPI documentation for \${functionName}.\`;
  const tags =
    Array.isArray(docConfig.tags) && docConfig.tags.length > 0
      ? docConfig.tags
      : [functionName.toUpperCase()];
  const statusCode = String(docConfig.statusCode || 200);

  const parameters: Array<Record<string, any>> = [];
  let requestBody: Record<string, any> | undefined;

  for (const validator of validators) {
    if (!validator || !validator.schema) continue;

    switch (validator.option) {
      case ValidationOptions.BODY: {
        const bodySchema = zodToOpenApiSchema(validator.schema);
        if (bodySchema) {
          requestBody = {
            required: true,
            content: {
              "application/json": {
                schema: bodySchema,
              },
            },
          };
        }
        break;
      }
      case ValidationOptions.QUERYPARAMS: {
        parameters.push(...zodToOpenApiParameters(validator.schema, "query"));
        break;
      }
      case ValidationOptions.PATHPARAMS: {
        parameters.push(...zodToOpenApiParameters(validator.schema, "path"));
        break;
      }
      case ValidationOptions.HEADERS: {
        parameters.push(...zodToOpenApiParameters(validator.schema, "header"));
        break;
      }
    }
  }

  const responseDataSchema = zodToOpenApiSchema(docConfig.response);
  const successResponseSchema: Record<string, any> = {
    type: "object",
    properties: {
      status: { type: "string", example: "success" },
      message: { type: "string", example: "Request successful" },
      ...(responseDataSchema
        ? { data: responseDataSchema }
        : {
            data: {
              type: "object",
              example: { greeting: \`Hello, World! from function \${functionName}\` },
            },
          }),
    },
    required: ["status", "message"],
  };

  const errorResponses = buildErrorResponses(docConfig.errors);
  if (hasAuthConfigured && !errorResponses["401"]) {
    errorResponses["401"] = {
      description: "Unauthorized — Invalid or missing authentication credentials",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              message: { type: "string", example: "Unauthorized" },
              error: { type: "string", example: "Invalid or expired token" },
            },
          },
        },
      },
    };
  }

  let securityBlock: Array<Record<string, string[]>> | undefined;
  if (Array.isArray(docConfig.security)) {
    securityBlock = docConfig.security.map((sec: any) =>
      typeof sec === "string" ? { [sec]: [] } : sec
    );
  } else if (hasAuthConfigured) {
    securityBlock = [{ BearerAuth: [] }, { BasicAuth: [] }];
  }

  const pathsResult: Record<string, any> = {};

  for (const { method, path: routePath } of httpEvents) {
    const routeParams = [...parameters];
    const pathParamMatches = [...routePath.matchAll(/\\{([^}]+)\\}/g)];
    for (const match of pathParamMatches) {
      const paramName = match[1];
      const alreadyExists = routeParams.some(
        (p) => p.in === "path" && p.name === paramName
      );
      if (!alreadyExists) {
        routeParams.push({
          name: paramName,
          in: "path",
          required: true,
          schema: { type: "string" },
        });
      }
    }

    const operationObject: Record<string, any> = {
      summary,
      description,
      tags,
      ...(securityBlock ? { security: securityBlock } : {}),
      ...(routeParams.length > 0 ? { parameters: routeParams } : {}),
      ...(requestBody ? { requestBody } : {}),
      responses: {
        [statusCode]: {
          description: "Successful response",
          content: {
            "application/json": {
              schema: successResponseSchema,
            },
          },
        },
        ...errorResponses,
      },
    };

    if (!pathsResult[routePath]) {
      pathsResult[routePath] = {};
    }
    pathsResult[routePath][method] = operationObject;
  }

  if (manualOverrides && typeof manualOverrides === "object") {
    for (const [overridePath, overrideVal] of Object.entries(manualOverrides)) {
      pathsResult[overridePath] = {
        ...(pathsResult[overridePath] || {}),
        ...(overrideVal as Record<string, any>),
      };
    }
  }

  return pathsResult;
}
`;

    const utilsDir = path.join(baseDir, `${projectName}/libs/common/utils`);
    fs.mkdirSync(utilsDir, { recursive: true });
    fs.writeFileSync(path.join(utilsDir, 'zodOpenApi.util.ts'), content, 'utf-8');
}

