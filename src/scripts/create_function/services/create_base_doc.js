import { getProjectRootOrThrow } from '../../../utils/project_context.js';
import { registerFunctionDoc } from '../../../services/docs/doc_manager.js';

export function createBaseDoc(functionName, functionPath, method, rootDir = null) {
    const projectRoot = rootDir || getProjectRootOrThrow();
    registerFunctionDoc(projectRoot, functionName, functionPath, method);
}

