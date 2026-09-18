import { describe, expect, it } from "vitest";
import { handleApiRequest } from "./rest-gateway.server";

describe("Public REST API Gateway (/api/public/v1/*)", () => {
  it("returns 404 problem details for an unknown route", async () => {
    const req = new Request(
      "https://api.framique.com/api/public/v1/non-existent-endpoint",
      {
        method: "GET",
        headers: {
          Authorization: "Bearer fq_live_invalidkey",
        },
      },
    );

    const res = await handleApiRequest(req, "non-existent-endpoint");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain(
      "application/problem+json",
    );

    const body = await res.json();
    expect(body.title).toBe("unknown_route");
    expect(body.status).toBe(404);
    expect(body.type).toBe("https://docs.framique.app/errors/unknown_route");
  });

  it("returns 401 unauthorized when Authorization header is missing", async () => {
    const req = new Request("https://api.framique.com/api/public/v1/products", {
      method: "GET",
    });

    const res = await handleApiRequest(req, "products");
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain(
      "application/problem+json",
    );

    const body = await res.json();
    expect(body.title).toBe("unauthorized");
    expect(body.status).toBe(401);
    expect(body.type).toBe("https://docs.framique.app/errors/unauthorized");
  });

  it("returns 401 unauthorized when Bearer token is malformed", async () => {
    const req = new Request("https://api.framique.com/api/public/v1/products", {
      method: "GET",
      headers: {
        Authorization: "Basic dXNlcjpwYXNz",
      },
    });

    const res = await handleApiRequest(req, "products");
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain(
      "application/problem+json",
    );

    const body = await res.json();
    expect(body.title).toBe("unauthorized");
    expect(body.status).toBe(401);
  });
});
