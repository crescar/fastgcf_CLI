import fs from 'fs';
import path from 'path';

export function folderStructure(projectName, baseDir = process.cwd()) {
    const folders = [
        `${projectName}/src/functions`,
        `${projectName}/src/preHandlers`,
        `${projectName}/src/docs/functions`,
        `${projectName}/libs/common/context`,
        `${projectName}/libs/common/middlewares`,
        `${projectName}/libs/common/utils`,
        `${projectName}/libs/common/wrappers`,
        `${projectName}/dist`,
    ];

    folders.forEach((folder) => {
        const folderPath = path.join(baseDir, folder);
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }
    });
}

