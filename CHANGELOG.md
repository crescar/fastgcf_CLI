# Changelog

## [1.0.0] - 2026-10-30

### Added
- Initial release of `fastgcf` CLI (`new`, `function`, `prehandler`, `build`, `start`, `docs`, `list`, `test`, `drop`).
- Unified Express multi-function runtime (`index.js`, `util.js`, `fastgcf.json`) with `/docs`, `/openapi.json`, and `/health` endpoints.
- TypeScript function scaffolding with `handlerResponse`, `FastgcfEvent` warm context, and `validatorMiddleware`.
- Automatic OpenAPI 3.0 specification generation from Zod schemas via `@asteasolutions/zod-to-openapi`.
- Fixed route slash normalization and duplicate route validation in `util.js`.

