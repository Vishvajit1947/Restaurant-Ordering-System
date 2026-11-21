import type { NextRequest } from "next/server";

// Same-origin proxy to the FastAPI backend. Keeping API calls on the frontend origin means the
// httpOnly auth cookie is first-party and no CORS configuration is needed in the browser.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

const HOP_BY_HOP = ["host", "connection", "content-length", "transfer-encoding", "keep-alive", "accept-encoding"];

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = `${BACKEND_URL}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  const headers = new Headers(req.headers);
  HOP_BY_HOP.forEach((h) => headers.delete(h));
  headers.set("x-forwarded-host", req.headers.get("host") ?? "");

  const hasBody = !["GET", "HEAD"].includes(req.method);
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return Response.json(
      { error: { code: "BACKEND_UNAVAILABLE", message: "The ordering service is unavailable. Please try again shortly.", details: {} } },
      { status: 502 },
    );
  }

  const resHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!["content-encoding", "content-length", "transfer-encoding", "connection", "set-cookie"].includes(key)) {
      resHeaders.set(key, value);
    }
  });
  for (const cookie of upstream.headers.getSetCookie()) resHeaders.append("set-cookie", cookie);

  const body = upstream.status === 204 || upstream.status === 304 ? null : await upstream.arrayBuffer();
  return new Response(body, { status: upstream.status, headers: resHeaders });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
