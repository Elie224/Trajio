/**
 * Thin, typed client over the Trajio REST API.
 *
 * Deliberately dependency-free: fetch is enough today, and a generated client
 * can replace this module later without touching any component.
 */

import { env } from "./env";

export type HealthPayload = {
  status: string;
  service: string;
  version: string;
  environment: string;
  timestamp: string;
};

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function fetchApiHealth(signal?: AbortSignal): Promise<HealthPayload> {
  const response = await fetch(env.apiBaseUrl + "/health", {
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new ApiError("Health check failed with status " + response.status, response.status);
  }

  return (await response.json()) as HealthPayload;
}
