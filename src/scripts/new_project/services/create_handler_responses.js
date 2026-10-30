import fs from 'fs';
import path from 'path';

function createHandlerErrorResponse(projectName, baseDir = process.cwd()) {
    const content = `export class HandlerErrorResponse extends Error {
  public statusCode: number;
  public message: string;
  public error: any;
  constructor(statusCode: number, message: string, error?: any) {
    super(message);
    this.statusCode = statusCode;
    this.message = message;
    this.error = error;
  }
}
`;
    const filePath = path.join(baseDir, `${projectName}/libs/common/utils/handlerErrorResponse.util.ts`);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
}

function createHandlerStandardResponse(projectName, baseDir = process.cwd()) {
    const content = `export type ResponseBody<T = any> = {
    message: string;
    status: string;
    data?: T;
};

export class HandlerStandardResponse<T = any> {
    public statusCode: number;
    public responseBody: ResponseBody<T>;
    constructor(statusCode: number, responseBody: ResponseBody<T>) {
        this.statusCode = statusCode;
        this.responseBody = responseBody;
    }
}
`;
    const filePath = path.join(baseDir, `${projectName}/libs/common/utils/handlerStandardResponse.util.ts`);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
}

export function createHandlerResponses(projectName, baseDir = process.cwd()) {
    createHandlerErrorResponse(projectName, baseDir);
    createHandlerStandardResponse(projectName, baseDir);
}

