import fs from 'fs';
import path from 'path';
import { nameToKebabCase } from '../../../utils/string_utils.js';

function createPackageJson(projectName, baseDir = process.cwd()) {
    const kebabName = nameToKebabCase(projectName);
    const content = {
        name: kebabName,
        version: '1.0.0',
        description: `FastGCF multi-function service for ${kebabName}`,
        main: 'index.js',
        type: 'module',
        scripts: {
            start: 'node index.js',
            dev: 'fastgcf start',
            build: 'fastgcf build',
            docs: 'fastgcf docs',
            test: 'fastgcf test',
        },
        keywords: ['gcp', 'cloud-run', 'cloud-functions', 'fastgcf', 'express', 'openapi', 'zod'],
        author: '',
        license: 'ISC',
        dependencies: {
            '@asteasolutions/zod-to-openapi': '^7.3.0',
            dotenv: '^16.4.7',
            express: '^5.1.0',
            'swagger-ui-express': '^5.0.1',
            zod: '^3.24.2',
        },
        devDependencies: {
            '@types/express': '^5.0.0',
            '@types/jest': '^29.5.14',
            '@types/node': '^22.10.0',
            '@types/swagger-ui-express': '^4.1.7',
            jest: '^29.7.0',
            'ts-jest': '^29.2.5',
            typescript: '^5.7.2',
        },
    };
    const filePath = path.join(baseDir, projectName, 'package.json');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n', 'utf-8');
}

function createTsConfig(projectName, baseDir = process.cwd()) {
    const content = {
        compilerOptions: {
            sourceMap: true,
            target: 'es2022',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            baseUrl: '.',
            esModuleInterop: true,
            forceConsistentCasingInFileNames: true,
            strict: true,
            skipLibCheck: true,
            declaration: true,
            outDir: 'dist',
            resolveJsonModule: true,
            paths: {
                [`@${projectName}/common/*`]: ['./libs/common/*'],
            },
            types: ['jest', 'node'],
        },
        include: [
            'libs/**/*.ts',
            'src/**/*.ts',
            '**/*.spec.ts',
            '**/*.test.ts',
        ],
        exclude: [
            'node_modules',
            'dist',
            'coverage',
        ],
    };
    const filePath = path.join(baseDir, projectName, 'tsconfig.json');
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n', 'utf-8');
}

function createJestConfig(projectName, baseDir = process.cwd()) {
    const content = `import type { Config } from 'jest';

const JestConfigBase: Config = {
  clearMocks: true,
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageProvider: "v8",
  rootDir: process.cwd(),
  passWithNoTests: true,
  testEnvironment: "node",
  testMatch: [
    "<rootDir>/src/**/*.spec.ts",
    "<rootDir>/libs/**/*.spec.ts"
  ],
  transform: {
    "^.+\\\\.[tj]s$": ["ts-jest", { tsconfig: { allowJs: true } }]
  },
  moduleFileExtensions: ["ts", "js", "json"],
  roots: [
    "<rootDir>/src",
    "<rootDir>/libs"
  ],
  coveragePathIgnorePatterns: [
    "/node_modules/"
  ],
  moduleNameMapper: {
    '^@${projectName}/common$': '<rootDir>/libs/common',
    '^@${projectName}/common/(.*)$': '<rootDir>/libs/common/$1'
  }
};

export default JestConfigBase;
`;
    const filePath = path.join(baseDir, projectName, 'jest.config.ts');
    fs.writeFileSync(filePath, content, 'utf-8');
}

function createFastGcfJson(projectName, baseDir = process.cwd()) {
    const content = {
        service: projectName,
        functions: [],
    };
    const filePath = path.join(baseDir, projectName, 'fastgcf.json');
    fs.writeFileSync(filePath, JSON.stringify(content, null, 4) + '\n', 'utf-8');
}

function createEnvExample(projectName, baseDir = process.cwd()) {
    const content = `PORT=3000
NODE_ENV=development
`;
    const filePath = path.join(baseDir, projectName, '.env.example');
    fs.writeFileSync(filePath, content, 'utf-8');
}

function createDockerfile(projectName, baseDir = process.cwd()) {
    const content = `FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY index.js util.js fastgcf.json ./
COPY dist ./dist

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "index.js"]
`;
    const filePath = path.join(baseDir, projectName, 'Dockerfile');
    fs.writeFileSync(filePath, content, 'utf-8');
}

export function createConfigurations(projectName, baseDir = process.cwd()) {
    createPackageJson(projectName, baseDir);
    createTsConfig(projectName, baseDir);
    createJestConfig(projectName, baseDir);
    createFastGcfJson(projectName, baseDir);
    createEnvExample(projectName, baseDir);
    createDockerfile(projectName, baseDir);
}

