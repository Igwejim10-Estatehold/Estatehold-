import { logger } from "./logger";

type SupabaseRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  prefer?: string;
  headers?: Record<string, string>;
  apiKey?: string;
  bearerToken?: string;
};

export class SupabaseRequestError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, code?: string) {
    super(`Supabase request failed (${status})`);
    this.name = "SupabaseRequestError";
    this.status = status;
    this.code = code;
  }
}

function requiredEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export function getSupabaseUrl(): string {
  let url: URL;
  try {
    url = new URL(requiredEnv("SUPABASE_URL"));
  } catch {
    throw new SupabaseRequestError(503, "INVALID_URL");
  }
  const path = url.pathname
    .replace(/\/(?:rest\/v1|auth\/v1|storage\/v1)\/?$/i, "")
    .replace(/\/+$/, "");
  return `${url.origin}${path}`;
}

export function getSupabaseAnonKey(): string {
  return requiredEnv("SUPABASE_ANON_KEY");
}

export function getServiceRoleKey(): string {
  return requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export async function fetchPrivatePropertyPhoto(path: string): Promise<globalThis.Response> {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(
    `${getSupabaseUrl()}/storage/v1/object/estatehold-evidence/${encodedPath}`,
    {
      headers: {
        apikey: getServiceRoleKey(),
        Authorization: `Bearer ${getServiceRoleKey()}`,
      },
      signal: AbortSignal.timeout(8000),
    },
  );
  return response;
}

export function getPublicConfig() {
  let supabaseUrl = "";
  try {
    supabaseUrl = getSupabaseUrl();
  } catch (error) {
    if (!(error instanceof SupabaseRequestError) || error.code !== "INVALID_URL") throw error;
  }
  return {
    supabaseUrl,
    supabaseAnonKey: getSupabaseAnonKey(),
    googleMapsApiKey: process.env["GOOGLE_MAPS_API_KEY"] ?? "",
    paystackPublicKey:
      process.env["PAYSTACK_PUBLIC_KEY"] ??
      "pk_test_e80fbdd42f4e9b967de0bcacbb0c09dd7",
    paymentMode: process.env["PAYSTACK_SECRET_KEY"]?.startsWith("sk_test_")
      ? "test"
      : "disabled",
  } as const;
}

function extractErrorCode(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const code = (body as Record<string, unknown>)["code"];
  return typeof code === "string" ? code : undefined;
}

async function requestJson<T>(
  url: string,
  options: SupabaseRequestOptions,
): Promise<T> {
  const apiKey = options.apiKey ?? getServiceRoleKey();
  const headers = new Headers(options.headers);
  headers.set("apikey", apiKey);
  headers.set("Authorization", `Bearer ${options.bearerToken ?? apiKey}`);
  headers.set("Accept", "application/json");
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.prefer) headers.set("Prefer", options.prefer);

  const method = options.method ?? "GET";
  const attempts = method === "GET" ? 3 : 1;
  let response: Response | undefined;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      response = await fetch(url, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(8000),
      });
      if (response.status < 500 || attempt === attempts) break;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        const cause = error instanceof Error ? (error as Error & { cause?: { code?: unknown } }).cause : undefined;
        const causeCode = typeof cause?.code === "string" ? cause.code : undefined;
        logger.error({ errorName: error instanceof Error ? error.name : "UnknownError", causeCode, attempts }, "Supabase read connection failed");
        throw new SupabaseRequestError(503, "CONNECTION_FAILED");
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
  }
  if (!response) {
    logger.error({ errorName: lastError instanceof Error ? lastError.name : "UnknownError" }, "Supabase returned no response");
    throw new SupabaseRequestError(503, "CONNECTION_FAILED");
  }

  if (!response.ok) {
    let code: string | undefined;
    try {
      code = extractErrorCode(await response.json());
    } catch {
      code = undefined;
    }
    throw new SupabaseRequestError(response.status, code);
  }

  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return null as T;
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function supabaseRest<T>(
  path: string,
  options: SupabaseRequestOptions = {},
): Promise<T> {
  const base = `${getSupabaseUrl()}/rest/v1/`;
  const url = new URL(path, base).toString();
  return requestJson<T>(url, options);
}

export async function supabaseAuthUser<T>(
  accessToken: string,
): Promise<T | null> {
  const url = `${getSupabaseUrl()}/auth/v1/user`;
  try {
    return await requestJson<T>(url, {
      apiKey: getSupabaseAnonKey(),
      bearerToken: accessToken,
    });
  } catch (error) {
    if (error instanceof SupabaseRequestError && error.status === 401) return null;
    throw error;
  }
}

export async function supabaseRpc<T>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  return supabaseRest<T>(`rpc/${encodeURIComponent(functionName)}`, {
    method: "POST",
    body,
  });
}