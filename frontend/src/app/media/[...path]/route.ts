import type { NextRequest } from "next/server";

// Serves uploaded and seeded menu images from the backend's /media directory.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  try {
    const upstream = await fetch(`${BACKEND_URL}/media/${path.map(encodeURIComponent).join("/")}`, {
      cache: "no-store",
    });
    if (!upstream.ok) return new Response("Not found", { status: upstream.status });
    return new Response(await upstream.arrayBuffer(), {
      status: 200,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
        "cache-control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("Image unavailable", { status: 502 });
  }
}
