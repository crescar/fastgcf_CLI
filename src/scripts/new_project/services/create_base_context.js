import fs from 'fs';
import path from 'path';

export function createBaseContext(projectName, baseDir = process.cwd()) {
    const content = `import type { Request, Response } from "express";

export interface DefaultWarmContext {
  secrets?: Record<string, unknown>;
  env?: Record<string, string | undefined>;
  db?: unknown;
  [key: string]: unknown;
}

export interface DefaultAuthUser {
  id?: string;
  email?: string;
  roles?: string[];
  [key: string]: unknown;
}

/**
 * FastgcfEvent wraps an Express Request (or mock test request) while embedding
 * cold-start initialized data (secrets, database clients, environment variables, etc.)
 * and pre-authenticated user data (from preHandlers) with static TypeScript typing.
 */
export class FastgcfEvent<
  TCustom = DefaultWarmContext,
  TAuth = DefaultAuthUser
> {
  public readonly rawRequest: Request;
  public readonly rawResponse?: Response;
  public readonly custom: TCustom;
  public readonly auth: TAuth;
  public readonly method: string;
  public readonly path: string;
  public readonly headers: Record<string, string | undefined>;
  public readonly query: Record<string, string | undefined>;
  public readonly params: Record<string, string | undefined>;
  public readonly body: unknown;

  // Aliases compatible with FastLBS style
  public readonly queryStringParameters: Record<string, string | undefined>;
  public readonly pathParameters: Record<string, string | undefined>;

  constructor(
    req: Request | Record<string, any>,
    customContext: TCustom,
    explicitAuth?: TAuth,
    res?: Response
  ) {
    const safeReq = (req && typeof req === "object" ? req : {}) as Record<string, any>;
    this.rawRequest = safeReq as Request;
    this.rawResponse = res;
    this.custom = customContext;
    this.auth = (explicitAuth ?? safeReq.auth ?? safeReq.user ?? {}) as TAuth;
    this.method = String(safeReq.method || "GET").toUpperCase();
    this.path = String(safeReq.path || safeReq.url || "/");

    const normalizedHeaders: Record<string, string | undefined> = {};
    if (safeReq.headers && typeof safeReq.headers === "object") {
      for (const [k, v] of Object.entries(safeReq.headers)) {
        normalizedHeaders[k] = Array.isArray(v) ? v.join(", ") : v !== undefined ? String(v) : undefined;
      }
    }
    this.headers = normalizedHeaders;

    const rawQuery = safeReq.query ?? safeReq.queryStringParameters ?? {};
    const normalizedQuery: Record<string, string | undefined> = {};
    if (rawQuery && typeof rawQuery === "object") {
      for (const [k, v] of Object.entries(rawQuery)) {
        normalizedQuery[k] = v !== undefined && v !== null ? String(v) : undefined;
      }
    }
    this.query = normalizedQuery;
    this.queryStringParameters = normalizedQuery;

    const rawParams = safeReq.params ?? safeReq.pathParameters ?? {};
    const normalizedParams: Record<string, string | undefined> = {};
    if (rawParams && typeof rawParams === "object") {
      for (const [k, v] of Object.entries(rawParams)) {
        normalizedParams[k] = v !== undefined && v !== null ? String(v) : undefined;
      }
    }
    this.params = normalizedParams;
    this.pathParameters = normalizedParams;

    this.body = safeReq.body;

    // Assign non-conflicting custom warm properties directly onto the context
    if (customContext && typeof customContext === "object") {
      for (const [key, value] of Object.entries(customContext)) {
        if (!(key in this)) {
          (this as any)[key] = value;
        }
      }
    }
  }

  /**
   * Returns authenticated user data injected by an auth preHandler.
   */
  public getAuthUser<TUser = TAuth>(): TUser {
    return this.auth as unknown as TUser;
  }

  /**
   * Safely retrieves or parses the JSON request body with optional generic typing.
   */
  public getJsonBody<TBody = unknown>(): TBody {
    if (this.body === undefined || this.body === null) {
      return {} as TBody;
    }
    if (typeof this.body === "string") {
      if (!this.body.trim()) {
        return {} as TBody;
      }
      try {
        return JSON.parse(this.body) as TBody;
      } catch {
        return {} as TBody;
      }
    }
    if (typeof this.body === "object") {
      return this.body as TBody;
    }
    return {} as TBody;
  }

  /**
   * Retrieves a query string parameter with optional fallback value.
   */
  public getQueryParam(key: string, defaultValue?: string): string | undefined {
    return this.query?.[key] ?? defaultValue;
  }

  /**
   * Retrieves a route path parameter with optional fallback value.
   */
  public getPathParam(key: string, defaultValue?: string): string | undefined {
    return this.params?.[key] ?? defaultValue;
  }

  /**
   * Retrieves a header value case-insensitively.
   */
  public getHeader(key: string): string | undefined {
    const lowerKey = key.toLowerCase();
    for (const [headerName, headerValue] of Object.entries(this.headers || {})) {
      if (headerName.toLowerCase() === lowerKey) {
        return headerValue;
      }
    }
    return undefined;
  }
}

export type FastgcfContext<
  TCustom = DefaultWarmContext,
  TAuth = DefaultAuthUser
> = FastgcfEvent<TCustom, TAuth> & TCustom;
`;

    const contextDir = path.join(baseDir, `${projectName}/libs/common/context`);
    fs.mkdirSync(contextDir, { recursive: true });
    fs.writeFileSync(path.join(contextDir, 'fastgcfContext.ts'), content, 'utf-8');
}

