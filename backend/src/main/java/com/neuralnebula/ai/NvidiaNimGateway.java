package com.neuralnebula.ai;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/** NVIDIA NIM's OpenAI-compatible chat-completions API. */
@Component
public final class NvidiaNimGateway implements TutorModelGateway {
    private final String apiKey;
    private final String model;
    private final String endpoint;
    private final RestClient restClient;

    public NvidiaNimGateway(@Value("${nvidia.api-key:}") String apiKey,
                            @Value("${nvidia.model:nvidia/nemotron-3.5-bolt-e4b}") String model,
                            @Value("${nvidia.endpoint:https://integrate.api.nvidia.com/v1/chat/completions}") String endpoint,
                            @Value("${nvidia.timeout-millis:45000}") int timeoutMillis) {
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.model = model;
        this.endpoint = endpoint;
        HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofMillis(timeoutMillis)).build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(Duration.ofMillis(timeoutMillis));
        this.restClient = RestClient.builder().requestFactory(requestFactory).build();
    }

    @Override
    public String generate(String systemInstruction, String prompt) {
        if (apiKey.isBlank()) throw new AiTutorNotConfiguredException();
        try {
            Map<?, ?> response = restClient.post().uri(endpoint)
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Accept", "application/json")
                    .body(Map.of(
                            "model", model,
                            "messages", List.of(
                                    Map.of("role", "system", "content", systemInstruction),
                                    Map.of("role", "user", "content", prompt)),
                            "stream", false,
                            "max_tokens", 2048,
                            "temperature", 0.35))
                    .retrieve().body(Map.class);
            String answer = extractAnswer(response);
            if (answer == null || answer.isBlank()) throw new AiTutorUnavailableException();
            return answer.trim();
        } catch (AiTutorUnavailableException exception) {
            throw exception;
        } catch (RestClientResponseException exception) {
            throw new AiTutorUnavailableException(providerMessage(exception.getStatusCode().value()));
        } catch (ResourceAccessException exception) {
            throw new AiTutorUnavailableException("Could not reach NVIDIA NIM before the request timed out. Check the connection and try again.");
        } catch (RuntimeException exception) {
            // Provider diagnostics may include request details; expose only a generic error.
            throw new AiTutorUnavailableException();
        }
    }

    private static String providerMessage(int status) {
        return switch (status) {
            case 401 -> "NVIDIA rejected the API key. Check NVIDIA_API_KEY in backend/.env and restart the backend.";
            case 403 -> "NVIDIA denied inference access for this key. Check that public API inference is enabled for the NVIDIA account.";
            case 404 -> "NVIDIA could not find the configured model. Check the NVIDIA_MODEL slug.";
            case 410 -> "NVIDIA reports this model or inference endpoint is no longer available. Choose an active NVIDIA_MODEL from the key's model list.";
            case 429 -> "NVIDIA rate or usage limit reached. Wait and try again, or check the account's model limits.";
            default -> "NVIDIA NIM returned an error (HTTP " + status + "). Please try again shortly.";
        };
    }

    private static String extractAnswer(Map<?, ?> response) {
        if (response == null || !(response.get("choices") instanceof List<?> choices) || choices.isEmpty()) return null;
        if (!(choices.getFirst() instanceof Map<?, ?> choice) || !(choice.get("message") instanceof Map<?, ?> message)) return null;
        Object content = message.get("content");
        return content instanceof String text ? text : null;
    }
}
