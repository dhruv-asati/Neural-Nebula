# Neural Nebula frontend

React, TypeScript, Vite, Three.js, React Three Fiber, and Drei interface for the knowledge galaxy.

## Local development

Run the Spring Boot backend, then from this directory:

```sh
npm install
npm run dev
```

The Vite development server proxies `/api` to `http://localhost:8080`, so local development does not need a backend CORS change. Set `VITE_DEV_API_TARGET` in the environment to change that proxy target, for example to `http://localhost:8081`. Set `VITE_API_BASE_URL` to a backend base URL when the frontend must call a separately hosted backend directly. API routes are appended to that value. See `.env.example`.

The exploration console uses the backend APIs for AND search, Trie autocomplete, typo suggestions, BFS paths, Union-Find components, weighted topic communities, max-heap Top-K, prerequisite learning order, and in-memory undo/redo. Note and ordinary relationship changes are written through the existing backend APIs; the frontend refreshes persisted graph and intelligence data after successful changes. Prerequisites are shown as directed learning dependencies and are not ordinary galaxy links.

## Build

```sh
npm run build
```

The galaxy's golden-angle layout is a deterministic visual arrangement keyed by note ID. The graph itself, note content, relationship endpoints, and algorithm results come from the backend. Unknown relationship endpoints are ignored by the scene. The frontend does not create a mock-data fallback.
