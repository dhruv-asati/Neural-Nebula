package com.neuralnebula.ai;

public final class AiTutorNotConfiguredException extends RuntimeException {
    public AiTutorNotConfiguredException() {
        super("AI Assistance is not configured. Add NVIDIA_API_KEY to backend/.env, then restart the backend.");
    }
}
