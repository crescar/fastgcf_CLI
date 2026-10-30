import fs from 'fs';
import path from 'path';

export function createBaseWrapper(projectName, baseDir = process.cwd()) {
    const content = `import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";
import { HandlerErrorResponse } from "../utils/handlerErrorResponse.util";
import { HandlerStandardResponse } from "../utils/handlerStandardResponse.util";
import {
  FastgcfEvent,
  type FastgcfContext,
  type DefaultWarmContext,
  type DefaultAuthUser,
} from "../context/fastgcfContext";

export type WarmInitializer<TCustom = Record<string, unknown>> = () => Promise<TCustom> | TCustom;

export type HttpMethod =
  | "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS" | "ALL"
  | "get" | "post" | "put" | "delete" | "patch" | "head" | "options" | "all";

export type ExpressPreHandler = (
  req: any,
  res: any,
  next: (err?: any) => void
) => unknown;

export interface HttpEventConfig {
  method?: HttpMethod | HttpMethod[];
  path: string;
  preHandlers?: string[];
}

export interface HandlerDocErrorConfig {
  description?: string;
  schema: ZodType;
}

export interface HandlerDocConfig {
  summary?: string;
  description?: string;
  tags?: string[];
  security?: Array<"BearerAuth" | "BasicAuth" | Record<string, string[]>>;
  response?: ZodType;
  statusCode?: number;
  errors?: Record<number | string, ZodType | HandlerDocErrorConfig>;
}

export interface HandlerOptions<
  TCustom = Record<string, unknown>,
  TAuth = DefaultAuthUser
> {
  init?: WarmInitializer<TCustom>;
  eagerInit?: boolean;
  event?: HttpEventConfig | HttpEventConfig[];
  preHandlers?: ExpressPreHandler[];
  before?: ExpressPreHandler[];
  doc?: HandlerDocConfig;
}

export type HandlerCallback<
  T = unknown,
  TCustom = DefaultWarmContext,
  TAuth = DefaultAuthUser
> = (
  event: FastgcfContext<TCustom, TAuth>,
  res?: Response
) => Promise<HandlerStandardResponse<T>>;

export type MiddlewareNext<T = any> = () => Promise<HandlerStandardResponse<T>>;

export type HandlerMiddleware<
  T = any,
  TCustom = DefaultWarmContext,
  TAuth = DefaultAuthUser
> = (
  event: FastgcfContext<TCustom, TAuth>,
  res: Response | undefined,
  next: MiddlewareNext<T>
) => Promise<HandlerStandardResponse<T>>;

export interface StructuredHttpResponse<T = any> {
  statusCode: number;
  body: string;
  responseBody: T;
}

export type FastgcfHandler<
  TCustom = DefaultWarmContext,
  TAuth = DefaultAuthUser
> = ((
  req: Request | Record<string, any>,
  res?: Response | Record<string, any>,
  next?: NextFunction
) => Promise<StructuredHttpResponse>) & {
  __fastgcfMetadata?: {
    kind: "http";
    options: HandlerOptions<TCustom, TAuth>;
    validators: Array<{ schema: ZodType; option: string }>;
  };
};

function isOptionsArg(firstArg: unknown): boolean {
  return (
    firstArg !== null &&
    typeof firstArg === "object" &&
    !Array.isArray(firstArg) &&
    typeof firstArg !== "function"
  );
}

function createWarmContextResolver<TCustom>(options: HandlerOptions<TCustom, any>) {
  let cachedWarmContext: TCustom | null = null;
  let initPromise: Promise<TCustom> | null = null;

  const resolveWarmContext = async (): Promise<TCustom> => {
    if (cachedWarmContext !== null) {
      return cachedWarmContext;
    }

    if (!options.init) {
      cachedWarmContext = {} as TCustom;
      return cachedWarmContext;
    }

    if (!initPromise) {
      initPromise = Promise.resolve(options.init())
        .then((data) => {
          cachedWarmContext = data;
          return data;
        })
        .catch((error) => {
          initPromise = null;
          throw error;
        });
    }

    return await initPromise;
  };

  if (
    options.eagerInit &&
    options.init &&
    !(globalThis as any).__FASTGCF_DOC_MODE__
  ) {
    resolveWarmContext().catch((err) => {
      console.error("[FastGCF] Eager cold-start initialization failed:", err);
    });
  }

  return resolveWarmContext;
}

function sendExpressResponse(res: any, statusCode: number, payload: unknown): void {
  if (!res || typeof res !== "object") {
    return;
  }
  if (res.headersSent) {
    return;
  }
  if (typeof res.status === "function") {
    const chained = res.status(statusCode);
    if (chained && typeof chained.json === "function") {
      chained.json(payload);
      return;
    }
    if (chained && typeof chained.send === "function") {
      chained.send(payload);
      return;
    }
  }
  if (typeof res.json === "function") {
    res.statusCode = statusCode;
    res.json(payload);
    return;
  }
  if (typeof res.send === "function") {
    res.statusCode = statusCode;
    res.send(payload);
  }
}

async function runInProcessPreHandlers(
  preHandlers: ExpressPreHandler[],
  req: any,
  res: any
): Promise<StructuredHttpResponse | null> {
  if (!Array.isArray(preHandlers) || preHandlers.length === 0) {
    return null;
  }
  if (req && req.__fastgcfPreHandlersExecuted) {
    return null;
  }

  let earlyStatus: number | null = null;
  let earlyBody: any = null;

  const resProxy = res || {
    headersSent: false,
    status(code: number) {
      earlyStatus = code;
      return this;
    },
    json(payload: any) {
      earlyBody = payload;
      this.headersSent = true;
      return this;
    },
    send(payload: any) {
      earlyBody = payload;
      this.headersSent = true;
      return this;
    },
  };

  for (const preFn of preHandlers) {
    if (typeof preFn !== "function") continue;
    let nextCalled = false;
    let nextErr: any = null;

    await Promise.resolve(
      preFn(req, resProxy, (err?: any) => {
        if (err) {
          nextErr = err;
          return;
        }
        nextCalled = true;
      })
    );

    if (nextErr) {
      throw nextErr;
    }

    if (!nextCalled || resProxy.headersSent || earlyStatus !== null) {
      const code = earlyStatus ?? resProxy.statusCode ?? 401;
      const bodyObj = earlyBody ?? { message: "Request halted by preHandler" };
      return {
        statusCode: code,
        body: typeof bodyObj === "string" ? bodyObj : JSON.stringify(bodyObj),
        responseBody: bodyObj,
      };
    }
  }

  return null;
}

export function handlerResponse<
  T = unknown,
  TCustom = DefaultWarmContext,
  TAuth = DefaultAuthUser
>(
  options: HandlerOptions<TCustom, TAuth>,
  ...args: [
    ...middlewares: HandlerMiddleware<T, TCustom, TAuth>[],
    callback: HandlerCallback<T, TCustom, TAuth>
  ]
): FastgcfHandler<TCustom, TAuth>;

export function handlerResponse<
  T = unknown,
  TCustom = DefaultWarmContext,
  TAuth = DefaultAuthUser
>(
  ...args: [
    ...middlewares: HandlerMiddleware<T, TCustom, TAuth>[],
    callback: HandlerCallback<T, TCustom, TAuth>
  ]
): FastgcfHandler<TCustom, TAuth>;

export function handlerResponse<
  T = unknown,
  TCustom = DefaultWarmContext,
  TAuth = DefaultAuthUser
>(
  ...args: any[]
): FastgcfHandler<TCustom, TAuth> {
  const hasOpts = isOptionsArg(args[0]);
  const options: HandlerOptions<TCustom, TAuth> = hasOpts ? args[0] : {};
  const callback: HandlerCallback<T, TCustom, TAuth> = args[args.length - 1];
  const middlewares: HandlerMiddleware<T, TCustom, TAuth>[] = hasOpts
    ? args.slice(1, -1)
    : args.slice(0, -1);

  const validators = middlewares
    .map((mw: any) => mw?.__fastgcfValidator)
    .filter(Boolean);

  const resolveWarmContext = createWarmContextResolver<TCustom>(options);
  const configuredPreHandlers: ExpressPreHandler[] = [
    ...(Array.isArray(options.preHandlers) ? options.preHandlers : []),
    ...(Array.isArray(options.before) ? options.before : []),
  ];

  const wrappedHandler: FastgcfHandler<TCustom, TAuth> = async (
    req: Request | Record<string, any> = {},
    res?: Response | Record<string, any>
  ): Promise<StructuredHttpResponse> => {
    try {
      const earlyResponse = await runInProcessPreHandlers(
        configuredPreHandlers,
        req,
        res
      );
      if (earlyResponse) {
        return earlyResponse;
      }

      const warmContext = await resolveWarmContext();
      const event = new FastgcfEvent<TCustom, TAuth>(
        req,
        warmContext,
        undefined,
        res as Response | undefined
      ) as FastgcfContext<TCustom, TAuth>;

      let currentIndex = -1;

      const dispatch = async (index: number): Promise<HandlerStandardResponse<T>> => {
        if (index <= currentIndex) {
          throw new HandlerErrorResponse(500, "next() called multiple times");
        }

        currentIndex = index;
        const middleware = middlewares[index];

        if (middleware) {
          return middleware(event, res as Response | undefined, () => dispatch(index + 1));
        }

        return callback(event, res as Response | undefined);
      };

      const result = await dispatch(0);
      sendExpressResponse(res, result.statusCode, result.responseBody);
      return {
        statusCode: result.statusCode,
        body: JSON.stringify(result.responseBody),
        responseBody: result.responseBody,
      };
    } catch (error) {
      if (error instanceof HandlerErrorResponse) {
        const errPayload = {
          message: error.message,
          error: error.error,
        };
        sendExpressResponse(res, error.statusCode, errPayload);
        return {
          statusCode: error.statusCode,
          body: JSON.stringify(errPayload),
          responseBody: errPayload,
        };
      }
      const unexpectedPayload = {
        message: "An unexpected error occurred",
        error: error instanceof Error ? error.message : String(error),
      };
      sendExpressResponse(res, 500, unexpectedPayload);
      return {
        statusCode: 500,
        body: JSON.stringify(unexpectedPayload),
        responseBody: unexpectedPayload,
      };
    }
  };

  wrappedHandler.__fastgcfMetadata = {
    kind: "http",
    options,
    validators,
  };

  return wrappedHandler;
}
`;

    const filePath = path.join(baseDir, `${projectName}/libs/common/wrappers/handlerResponse.wrapper.ts`);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
}
