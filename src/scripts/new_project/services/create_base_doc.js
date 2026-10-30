import fs from 'fs';
import path from 'path';

export function createBaseDoc(projectName, baseDir = process.cwd()) {
    const content = `const paths: any[] = [

];

function mergePaths(paths: any[]) {
    const mergedPaths: any = {};
    for (const doc of paths) {
        const docPaths = doc?.paths ?? doc;
        for (const [key, value] of Object.entries(docPaths || {})) {
            const nextValue = (value && typeof value === "object") ? value : {};
            if (!mergedPaths[key]) {
                mergedPaths[key] = nextValue;
            } else {
                mergedPaths[key] = { ...mergedPaths[key], ...nextValue };
            }
        }
    }
    return mergedPaths;
}

export default {
    "openapi": "3.0.0",
    "info": {
        "title": "${projectName} API Documentation",
        "description": "Auto-generated OpenAPI 3.0 documentation for ${projectName} (FastGCF).",
        "version": "1.0.0"
    },
    "servers": [
        {
            "url": "/",
            "description": "Current FastGCF Service"
        }
    ],
    "paths": {
        ...mergePaths(paths)
    },
    "components": {
        "securitySchemes": {
            "BearerAuth": {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT"
            },
            "BasicAuth": {
                "type": "http",
                "scheme": "basic"
            }
        }
    },
    "security": [
        {
            "BearerAuth": []
        },
        {
            "BasicAuth": []
        }
    ]
};
`;

    const filePath = path.join(baseDir, `${projectName}/src/docs/index.ts`);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
}

