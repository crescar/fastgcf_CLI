import fs from 'fs';
import path from 'path';
import { assertPathInsideProject, assertValidFunctionName } from '../../utils/cli_validation.js';
import { toDocConstName } from '../../utils/string_utils.js';

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function writeFileIfChanged(filePath, newContent) {
    const normalizedNew = newContent.replace(/\r\n/g, '\n');
    if (fs.existsSync(filePath)) {
        const existing = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n');
        if (existing === normalizedNew) {
            return false;
        }
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, newContent, 'utf-8');
    return true;
}

export function findMatchingToken(content, openIndex, openChar, closeChar) {
    let depth = 0;
    let inString = false;
    let stringDelimiter = '';
    let escaped = false;

    for (let i = openIndex; i < content.length; i++) {
        const ch = content[i];

        if (inString) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                continue;
            }
            if (ch === stringDelimiter) {
                inString = false;
                stringDelimiter = '';
            }
            continue;
        }

        if (ch === '"' || ch === "'" || ch === '`') {
            inString = true;
            stringDelimiter = ch;
            continue;
        }

        if (ch === openChar) {
            depth += 1;
            continue;
        }

        if (ch === closeChar) {
            depth -= 1;
            if (depth === 0) {
                return i;
            }
        }
    }

    return -1;
}

export function generateDocFile(projectRoot, functionName) {
    assertValidFunctionName(functionName);
    const docsDir = path.join(projectRoot, 'src', 'docs', 'functions');
    assertPathInsideProject(projectRoot, docsDir, 'docs directory');

    const docConstName = toDocConstName(functionName);

    const content = `import { extractOpenApiFromHandler } from "../../../libs/common/utils/zodOpenApi.util";
import * as fnModule from "../../functions/${functionName}/index";
import fastgcfConfig from "../../../fastgcf.json";

const functionEntry = (fastgcfConfig.functions || []).find(
    (f: any) =>
        f.name === "${functionName}" ||
        f.handler === "dist/${functionName}/index.js"
);

export const ${docConstName} = extractOpenApiFromHandler(
    "${functionName}",
    fnModule,
    functionEntry
);
`;

    const docPath = path.join(docsDir, `${functionName}.ts`);
    writeFileIfChanged(docPath, content.trimStart());
}

export function addDocToPathsArray(indexContent, docConstName) {
    const pathsMatch = indexContent.match(/const\s+paths(?:\s*:[^=]+)?\s*=\s*\[/m);
    if (!pathsMatch || pathsMatch.index === undefined) {
        return indexContent;
    }

    const openBracketIndex = pathsMatch.index + pathsMatch[0].lastIndexOf('[');
    const closeBracketIndex = findMatchingToken(indexContent, openBracketIndex, '[', ']');

    if (closeBracketIndex === -1) {
        return indexContent;
    }

    const pathsBody = indexContent.slice(openBracketIndex + 1, closeBracketIndex);
    const escapedConstName = escapeRegExp(docConstName);
    const arrayItemRegex = new RegExp(`\\b${escapedConstName}\\b`);
    if (arrayItemRegex.test(pathsBody)) {
        return indexContent;
    }

    const lineStart = indexContent.lastIndexOf('\n', openBracketIndex) + 1;
    const pathsLine = indexContent.slice(lineStart, openBracketIndex);
    const baseIndent = (pathsLine.match(/^\s*/) || [''])[0];
    const entryIndent = `${baseIndent}    `;

    let newPathsBody = pathsBody;
    const trimmedBody = pathsBody.trim();

    if (trimmedBody.length === 0) {
        newPathsBody = `\n${entryIndent}${docConstName}\n${baseIndent}`;
    } else {
        const trailingWhitespaceMatch = pathsBody.match(/\s*$/);
        const trailingWhitespace = trailingWhitespaceMatch ? trailingWhitespaceMatch[0] : '';
        let bodyWithoutTrailingWs = pathsBody.slice(0, pathsBody.length - trailingWhitespace.length);

        let endIndex = bodyWithoutTrailingWs.length - 1;
        while (endIndex >= 0 && /\s/.test(bodyWithoutTrailingWs[endIndex])) {
            endIndex -= 1;
        }

        if (endIndex >= 0 && bodyWithoutTrailingWs[endIndex] !== ',') {
            bodyWithoutTrailingWs = `${bodyWithoutTrailingWs.slice(0, endIndex + 1)},${bodyWithoutTrailingWs.slice(endIndex + 1)}`;
        }

        newPathsBody = `${bodyWithoutTrailingWs}\n${entryIndent}${docConstName}${trailingWhitespace}`;
    }

    return `${indexContent.slice(0, openBracketIndex + 1)}${newPathsBody}${indexContent.slice(closeBracketIndex)}`;
}

export function registerFunctionDoc(projectRoot, functionName, functionPath, method) {
    generateDocFile(projectRoot, functionName, functionPath, method);

    const indexPath = path.join(projectRoot, 'src', 'docs', 'index.ts');
    assertPathInsideProject(projectRoot, indexPath, 'docs index file');

    if (!fs.existsSync(indexPath)) {
        return;
    }

    let indexContent = fs.readFileSync(indexPath, 'utf-8');
    const docConstName = toDocConstName(functionName);
    const importStatement = `import { ${docConstName} } from "./functions/${functionName}";`;

    if (!indexContent.includes(importStatement)) {
        const importMatches = [...indexContent.matchAll(/^import\s.+;$/gm)];
        if (importMatches.length > 0) {
            const lastImport = importMatches[importMatches.length - 1];
            const insertAt = (lastImport.index ?? 0) + lastImport[0].length;
            indexContent = `${indexContent.slice(0, insertAt)}\n${importStatement}${indexContent.slice(insertAt)}`;
        } else {
            indexContent = `${importStatement}\n\n${indexContent}`;
        }
    }

    indexContent = addDocToPathsArray(indexContent, docConstName);
    writeFileIfChanged(indexPath, indexContent);
}

export function removeDocFromPaths(indexContent, docConstName) {
    const pathsMatch = indexContent.match(/["']?paths["']?\s*:\s*\{/m);
    if (!pathsMatch || pathsMatch.index === undefined) {
        return indexContent;
    }

    const openBraceIndex = pathsMatch.index + pathsMatch[0].lastIndexOf('{');
    const closeBraceIndex = findMatchingToken(indexContent, openBraceIndex, '{', '}');

    if (closeBraceIndex === -1) {
        return indexContent;
    }

    const pathsBody = indexContent.slice(openBraceIndex + 1, closeBraceIndex);
    const escapedDocConstName = escapeRegExp(docConstName);
    const spreadRegex = new RegExp(`(^\\s*\\.\\.\\.${escapedDocConstName}\\s*,?\\s*$\\n?)`, 'gm');
    const cleanedBody = pathsBody.replace(spreadRegex, '');

    return `${indexContent.slice(0, openBraceIndex + 1)}${cleanedBody}${indexContent.slice(closeBraceIndex)}`;
}

export function unregisterFunctionDoc(projectRoot, functionName) {
    const docFile = path.join(projectRoot, 'src', 'docs', 'functions', `${functionName}.ts`);
    if (fs.existsSync(docFile)) {
        fs.rmSync(docFile, { force: true });
    }

    const indexPath = path.join(projectRoot, 'src', 'docs', 'index.ts');
    if (!fs.existsSync(indexPath)) {
        return;
    }

    let indexContent = fs.readFileSync(indexPath, 'utf-8');
    const docConstName = toDocConstName(functionName);
    const escapedDocConstName = escapeRegExp(docConstName);
    const escapedFunctionName = escapeRegExp(functionName);

    const importRegex = new RegExp(
        `^\\s*import\\s+\\{\\s*${escapedDocConstName}\\s*\\}\\s+from\\s+["']\\.\\/functions\\/${escapedFunctionName}(?:\\.ts)?["'];?\\s*\\r?\\n?`,
        'gm'
    );
    indexContent = indexContent.replace(importRegex, '');

    const pathsArrayMatch = indexContent.match(/const\s+paths(?:\s*:[^=]+)?\s*=\s*\[/m);
    if (pathsArrayMatch && pathsArrayMatch.index !== undefined) {
        const openBracketIndex = pathsArrayMatch.index + pathsArrayMatch[0].lastIndexOf('[');
        const closeBracketIndex = findMatchingToken(indexContent, openBracketIndex, '[', ']');
        if (closeBracketIndex !== -1) {
            let pathsBody = indexContent.slice(openBracketIndex + 1, closeBracketIndex);
            const itemRegex = new RegExp(`(^|\\n)\\s*${escapedDocConstName}\\s*,?\\s*`, 'g');
            pathsBody = pathsBody.replace(itemRegex, (match, p1) => p1);
            pathsBody = pathsBody.replace(/,\s*,/g, ',');
            pathsBody = pathsBody.replace(/^\s*,|,\s*$/g, '');
            indexContent = `${indexContent.slice(0, openBracketIndex + 1)}${pathsBody}${indexContent.slice(closeBracketIndex)}`;
        }
    }

    indexContent = removeDocFromPaths(indexContent, docConstName);
    indexContent = indexContent.replace(/\n{3,}/g, '\n\n');
    indexContent = indexContent.replace(/[ \t]+\n/g, '\n');
    indexContent = indexContent.replace(/^\s*\n/, '');
    writeFileIfChanged(indexPath, indexContent);
}
