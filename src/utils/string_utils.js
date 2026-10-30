export function nameToKebabCase(name) {
    return String(name)
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase();
}

export function toPascalCase(name) {
    return String(name)
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[^a-zA-Z0-9]+/)
        .filter(Boolean)
        .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
        .join('');
}

export function toCamelCase(name) {
    const pascal = toPascalCase(name);
    if (!pascal) return '';
    return pascal[0].toLowerCase() + pascal.slice(1);
}

export function toDocConstName(functionName) {
    const pascalName = String(functionName)
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[^a-zA-Z0-9]+/)
        .filter(Boolean)
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join('');

    return `${pascalName || functionName}Doc`;
}

export function normalizeRoutePath(rawPath) {
    const trimmed = String(rawPath ?? '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
    return trimmed;
}

export function toExpressMountPath(rawPath) {
    const clean = normalizeRoutePath(rawPath);
    // Convert OpenAPI {id} to Express :id if present
    const expressPath = clean.replace(/\{([^}]+)\}/g, ':$1');
    return `/${expressPath}`;
}

export function toOpenApiRoutePath(rawPath) {
    const clean = normalizeRoutePath(rawPath);
    // Convert Express :id to OpenAPI {id} if present
    const openApiPath = clean.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
    return `/${openApiPath}`;
}

export function inferFunctionName(funcEntry) {
    if (funcEntry?.name && typeof funcEntry.name === 'string') {
        return funcEntry.name;
    }
    if (funcEntry?.handler && typeof funcEntry.handler === 'string') {
        const match = funcEntry.handler.match(/^(?:dist\/)?(?:functions\/)?([^/]+)\/index\.[jt]s$/);
        if (match) {
            return match[1];
        }
    }
    if (funcEntry?.path && typeof funcEntry.path === 'string') {
        const segments = normalizeRoutePath(funcEntry.path).split('/').filter(Boolean);
        return segments[segments.length - 1] || 'unknown';
    }
    return 'unknown';
}
