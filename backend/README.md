# Neural Nebula Backend

Java 21 / Spring Boot backend. Stage 3 stores canonical note and relationship records in versioned JSON; graph adjacency lists, keyword indexes, and autocomplete terms are rebuilt in memory at startup.

## Run

From `backend/`:

```powershell
mvn test
mvn spring-boot:run
```

The default storage file is `backend/data/knowledge.json`. Configure it with the `neuralnebula.storage.path` application property or `NEURAL_NEBULA_STORAGE_PATH` environment variable. Sample data is disabled by default. To seed the default file only when it does not already exist, set `neuralnebula.seed-sample-data=true` or `NEURAL_NEBULA_SEED_SAMPLE_DATA=true` before first startup. Seeding never replaces an existing file.

The JSON document has `schemaVersion`, `notes`, `relationships`, and `prerequisites` fields. Current schema version is 1. Notes and relationship IDs must be unique; ordinary links are undirected, cannot be self-links or duplicate endpoint pairs, and must reference existing notes. Prerequisite dependencies are a separate directed collection; they do not create ordinary graph edges. Prerequisite references must be unique, non-self, and point to existing notes. Deleting a note removes its ordinary links and prerequisite references; undo restores them.

Mutations build and validate a candidate snapshot, write it to a temporary sibling file, then replace the canonical file (atomically when supported). The new in-memory note lookup, graph, keyword index, and Trie are published only after the write succeeds. API write failures return HTTP 500 with code `PERSISTENCE_FAILED`; the prior in-memory state remains active.

## REST endpoints

| Endpoint | Behavior |
| --- | --- |
| `GET /api/notes` | List notes in deterministic ID order |
| `POST /api/notes` | Create a note; ID and timestamps are server generated |
| `GET /api/notes/{id}` | Retrieve a note |
| `PUT /api/notes/{id}` | Replace note fields while preserving ID and creation time |
| `DELETE /api/notes/{id}` | Delete a note and its ordinary links and prerequisite references |
| `GET /api/search?q=...` | Inverted-index search; every normalized query token must match (AND) |
| `GET /api/search/suggestions?q=...&limit=10` | Prefix autocomplete plus single-token corrections up to edit distance 2 |
| `GET /api/graph` | Graph nodes and persisted ordinary relationship edges |
| `POST /api/relationships` | Create a manual ordinary relationship |
| `DELETE /api/relationships/{id}` | Remove an ordinary relationship |
| `GET /api/relationships/suggestions?noteId=...&threshold=0.1` | Ranked suggestions; does not create edges |
| `GET /api/algorithms/components` | Union-Find connected components |
| `GET /api/algorithms/path?from=...&to=...` | BFS shortest path |
| `GET /api/algorithms/communities` | Weighted label-propagation topic communities |
| `GET /api/algorithms/dfs?start=...` | DFS traversal order and operation counts |
| `GET /api/algorithms/top-k?limit=10` | Notes by importance descending, then ID ascending; zero returns an empty list and negative limits return 400 |
| `GET /api/algorithms/learning-order` | Deterministic prerequisite-first topological order; reports blocked note IDs if a cycle exists |
| `GET /api/prerequisites` | List directed prerequisite dependencies |
| `POST /api/prerequisites` | Create a dependency with `{ "prerequisiteNoteId": "...", "dependentNoteId": "..." }` |
| `DELETE /api/prerequisites/{prerequisiteNoteId}/{dependentNoteId}` | Remove a directed prerequisite dependency |
| `GET /api/history` | Report undo/redo availability and next actions |
| `POST /api/history/undo` | Persist and apply the most recent successful mutation in reverse |
| `POST /api/history/redo` | Persist and reapply the most recently undone mutation |

History covers successful note create/update/delete, ordinary relationship create/delete, and prerequisite create/delete operations. No-op note updates do not add history. A new successful mutation after undo clears the redo stack. Each history action is stored in memory and is cleared when the service restarts; the current JSON snapshot remains persisted. Persistence must succeed before a mutation or undo/redo operation is published in memory or its history stacks are changed. Empty undo/redo requests return an operation result with `applied: false`.

Errors use `{ "status", "code", "message", "path" }`. Missing resources return 404, invalid requests return 400, duplicates return 409, and file-write failures return 500. Top-K rejects negative limits with 400 and returns all notes when the limit exceeds the note count.

Learning order uses Kahn's algorithm over directed prerequisites (`prerequisiteNoteId` → `dependentNoteId`). Among currently ready notes, IDs are selected ascending. The response includes `possible`, `learningOrder`, `blockedNoteIds`, and `prerequisiteCount`; when a cycle prevents completion, `blockedNoteIds` identifies notes still blocked after all available nodes have been emitted. This endpoint does not alter ordinary graph connectivity.
