// Thin fetch wrapper. All calls go to the same-origin /api proxy (src/app/api/[...path]/route.ts),
// which forwards to the FastAPI backend, so the httpOnly auth cookie works without CORS.

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get fields(): FieldError[] {
    return (this.details.fields as FieldError[] | undefined) ?? [];
  }
}

type Options = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  idempotencyKey?: string;
  query?: Record<string, string | number | boolean | undefined | null | string[]>;
};

function buildQuery(query?: Options["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
    else params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) {
    body = opts.body;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`/api/v1${path}${buildQuery(opts.query)}`, {
      method: opts.method ?? "GET",
      headers,
      body,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the server. Check your connection and try again.");
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "HTTP_ERROR",
      err?.message ?? `Request failed (${res.status})`,
      err?.details ?? {},
    );
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

export function newIdempotencyKey(): string {
  const c: Crypto = globalThis.crypto;
  // randomUUID only exists in secure contexts (https / localhost); fall back to getRandomValues otherwise.
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
