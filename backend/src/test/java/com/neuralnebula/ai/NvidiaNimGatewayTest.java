package com.neuralnebula.ai;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NvidiaNimGatewayTest {
    @Test
    void missingKeyDoesNotPreventConstructionAndGivesConfigurationGuidanceOnRequest() {
        NvidiaNimGateway gateway = new NvidiaNimGateway(" ", "test/model", "http://127.0.0.1:1", 1000);
        AiTutorNotConfiguredException error = assertThrows(AiTutorNotConfiguredException.class,
                () -> gateway.generate("system", "prompt"));
        assertTrue(error.getMessage().contains("NVIDIA_API_KEY"));
    }

    @Test
    void sendsSystemAndContextMessagesToConfiguredChatCompletionsEndpoint() throws Exception {
        AtomicReference<String> authorization = new AtomicReference<>();
        AtomicReference<String> body = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/chat/completions", exchange -> {
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] response = "{\"choices\":[{\"message\":{\"content\":\"NVIDIA tutor reply\"}}]}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();
        try {
            String endpoint = "http://127.0.0.1:" + server.getAddress().getPort() + "/v1/chat/completions";
            NvidiaNimGateway gateway = new NvidiaNimGateway("test-token", "test/model", endpoint, 3000);
            assertEquals("NVIDIA tutor reply", gateway.generate("Tutor instructions", "Selected note context and question"));
            assertEquals("Bearer test-token", authorization.get());
            assertTrue(body.get().contains("test/model"));
            assertTrue(body.get().contains("Tutor instructions"));
            assertTrue(body.get().contains("Selected note context and question"));
        } finally {
            server.stop(0);
        }
    }
}
