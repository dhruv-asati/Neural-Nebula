# Neural Nebula

Neural Nebula is a local-first knowledge graph for organizing notes and exploring how concepts relate. Its Spring Boot API persists canonical notes and relationships to JSON, while a React and Three.js frontend renders the live graph as an interactive galaxy.

## Features

- Create, read, update, and delete notes and ordinary relationships.
- Search note content, autocomplete keywords, and receive typo and relationship suggestions.
- Explore graph paths, connected components, topic communities, and prerequisite learning order.
- Inspect top-ranked notes and undo or redo recent mutations during a backend session.
- Store graph data in a versioned JSON file; graph indexes are rebuilt in memory.

## Technology and architecture

- Backend: Java 21, Spring Boot, Maven.
- Frontend: React, TypeScript, Vite, Three.js, React Three Fiber, and Drei.
- Backend domain models and services own graph mutations and persistence. Custom DSA implementations provide graph traversal, indexing, autocomplete, ranking, and graph intelligence.
- The frontend requests graph and intelligence data from the backend; it has no mock-data fallback.

## Project layout

```text
backend/   Spring Boot API, domain, DSA implementations, tests, and sample JSON data
frontend/  React/Vite application and graph visualization
```

## Prerequisites

- Java 21 JDK
- Maven 3.9+
- Node.js and npm (the frontend package uses Vite 8)

## Run locally

### Backend

In a terminal:

```powershell
cd backend
mvn spring-boot:run
```

The default API address is `http://localhost:8080`. Canonical data is stored at `backend/data/knowledge.json` when launched from the project root, or `data/knowledge.json` when launched from `backend/`. Set `NEURAL_NEBULA_STORAGE_PATH` to select another file. Sample seeding is disabled by default; enabling `NEURAL_NEBULA_SEED_SAMPLE_DATA` only seeds when the configured file does not exist.

### Frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Vite serves the app at its displayed local URL (normally `http://localhost:5173`) and proxies `/api` to `http://localhost:8080`. To use a different local backend port, set `VITE_DEV_API_TARGET` in the frontend environment. For a separately hosted API, set `VITE_API_BASE_URL` to its base URL. `frontend/.env.example` documents these variables; copy it to an untracked `.env.local` for machine-specific values.

## Build and test

Backend, from `backend/`:

```powershell
mvn test
mvn clean verify
```

Frontend, from `frontend/`:

```sh
npm run lint
npm run build
```

## Data structures and algorithms

- HashMap note lookup supports ID-based access; an adjacency-list graph stores ordinary undirected links.
- An inverted keyword index, Trie autocomplete, and Levenshtein edit distance support search and suggestions. Jaccard similarity ranks related-note suggestions.
- BFS finds shortest paths; DFS traverses the graph; Union-Find computes connected components; weighted label propagation estimates topic communities.
- A custom max heap ranks notes by importance. Kahn's algorithm orders prerequisite dependencies, choosing the smallest currently ready note ID for deterministic tie-breaking.
- Prerequisite links are directed learning dependencies and remain separate from ordinary graph relationships.

## Main API routes

- `GET /api/graph`, `GET /api/notes`, `GET /api/notes/{id}`
- `POST /api/notes`, `PUT /api/notes/{id}`, `DELETE /api/notes/{id}`
- `GET /api/search?q=...`, `GET /api/search/suggestions?q=...`
- `POST /api/relationships`, `DELETE /api/relationships/{id}`, `GET /api/relationships/suggestions`
- `GET /api/algorithms/components`, `/path`, `/communities`, `/dfs`, `/top-k`, `/learning-order`
- `GET /api/prerequisites`, `POST /api/prerequisites`, `DELETE /api/prerequisites/{prerequisiteNoteId}/{dependentNoteId}`
- `GET /api/history`, `POST /api/history/undo`, `POST /api/history/redo`

See [backend/README.md](backend/README.md) for request details, validation, status codes, persistence behavior, and all endpoint contracts. See [frontend/README.md](frontend/README.md) for frontend-specific development details.

## Notes and limitations

- The checked-in `backend/data/knowledge.json` is the project's sample knowledge graph. Back it up before experimenting with mutations against that file.
- Undo and redo history is in memory and is cleared when the backend restarts; the latest graph snapshot remains persisted.
- Topic communities are an algorithmic grouping of connected graph data, not a semantic guarantee.
- The production frontend build currently reports a large Three.js scene chunk; the generated output is ignored and should not be committed.
