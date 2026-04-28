# Architecture Mapping

This project follows the layered architecture from the Smart Day Planner diagram.

```text
React Client
  -> Express API
  -> Planner Service
  -> AI Helper + Scheduler Core
  -> JSON dev store or MySQL database
```

## Diagram Layers

- Presentation Layer: `client/src`
- Application Layer: `server/src/app.js`, `server/src/routes`
- Processing/Core Layer: `server/src/services`, `server/src/logic`
- Data Layer: `server/src/data`, `database/schema.sql`
- Future AI Layer: `ai-service`

## Current Development Store

The app uses the JSON store by default so the project can run without MySQL during development.

Set this environment variable to use MySQL later:

```text
DATA_STORE=mysql
```
