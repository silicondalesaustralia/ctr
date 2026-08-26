import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function apiOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_URL ??
    "http://localhost:3001"
  ).replace(/\/$/, "");
}

async function proxyRequest(request: NextRequest, pathSegments: string[]): Promise<NextResponse> {
  const path = pathSegments.join("/");
  const target = `${apiOrigin()}/${path}${request.nextUrl.search}`;

  const headers = new Headers();
  const apiKey = request.headers.get("x-api-key");
  const contentType = request.headers.get("content-type");
  if (apiKey) headers.set("x-api-key", apiKey);
  if (contentType) headers.set("content-type", contentType);

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: "no-store",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  let response: Response;
  try {
    response = await fetch(target, init);
  } catch {
    return NextResponse.json(
      { error: `Cannot reach API at ${apiOrigin()}` },
      { status: 502 },
    );
  }

  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json",
    },
  });
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}
