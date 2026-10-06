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
  const url = new URL(requiredEnv("SUPABASE_URL"));
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

export function getPublicConfig() {
  return {
    supabaseUrl: getSupabaseUrl(),
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

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

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