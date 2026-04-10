import ky from "ky";
import { useAuthStore } from "@/store/auth.store";
import type { ApiErrorResponse } from "@/types";

const API_KEY = import.meta.env.VITE_API_KEY as string;

export const apiClient = ky.create({
  prefix: "/api",
  throwHttpErrors: false,
  hooks: {
    beforeRequest: [
      (request) => {
        const token = useAuthStore.getState().token;
        if (token)
          request.request.headers.set("Authorization", `Bearer ${token}`);
        if (API_KEY) request.request.headers.set("x-api-key", API_KEY);
      },
    ],
    afterResponse: [
      async (state) => {
        // Only handle 401 with UNAUTHORIZED error code for protected endpoints
        // Skip auth endpoints (login, register, etc.) to allow proper error handling
        const url = state.request.url;
        const isAuthEndpoint =
          url.includes("/auth/login") || url.includes("/auth/register");

        if (state.response.status === 401 && !isAuthEndpoint) {
          try {
            const body = (await state.response.json()) as ApiErrorResponse;
            if (!body.success && body.error?.code === "UNAUTHORIZED") {
              useAuthStore.getState().clearAuth();
              window.location.href = "/login";
            }
          } catch {
            // If response is not valid JSON, still clear auth on 401
            useAuthStore.getState().clearAuth();
            window.location.href = "/login";
          }
        }
      },
    ],
  },
});
