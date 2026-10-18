package com.neuralnebula.persistence;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Optional;

/** Versioned JSON file storage with sibling-temp-file writes and atomic replacement when supported. */
@Component
public final class JsonFileStore {
    private final Path file;
    private final JsonMapper jsonMapper;

    @Autowired
    public JsonFileStore(@Value("${neuralnebula.storage.path:data/knowledge.json}") String file,
                         JsonMapper jsonMapper) {
        this(Path.of(file), jsonMapper);
    }

    public JsonFileStore(Path file, JsonMapper jsonMapper) {
        this.file = file.toAbsolutePath().normalize();
        this.jsonMapper = jsonMapper;
    }

    public Path path() { return file; }
    public boolean exists() { return Files.exists(file); }

    public Optional<PersistedData> load() {
        if (!exists()) return Optional.empty();
        try {
            PersistedData data = jsonMapper.readValue(file.toFile(), PersistedData.class);
            if (data == null) throw new IllegalStateException("Data file is empty or invalid");
            return Optional.of(data);
        } catch (RuntimeException exception) {
            throw new IllegalStateException("Unable to read valid knowledge data from the configured JSON file", exception);
        }
    }

    public void write(PersistedData data) {
        Path parent = file.getParent();
        Path temporary = null;
        try {
            Files.createDirectories(parent);
            temporary = Files.createTempFile(parent, file.getFileName().toString(), ".tmp");
            jsonMapper.writeValue(temporary.toFile(), data);
            try {
                Files.move(temporary, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } catch (AtomicMoveNotSupportedException exception) {
                Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException | RuntimeException exception) {
            throw new PersistenceException("Could not safely save knowledge data", exception);
        } finally {
            if (temporary != null) {
                try { Files.deleteIfExists(temporary); } catch (IOException ignored) { }
            }
        }
    }
}
