import { describe, expect, it } from "vitest";
import { withSafePrismaPool } from "../../src/db/client.js";

describe("withSafePrismaPool", () => {
  it("caps absurd Neon connection_limit values", () => {
    const url = withSafePrismaPool(
      "postgresql://u:p@host/db?sslmode=require&connection_limit=97",
    );
    expect(url).toContain("connection_limit=5");
    expect(url).toContain("pool_timeout=20");
  });

  it("leaves a sane connection_limit alone", () => {
    const url = withSafePrismaPool(
      "postgresql://u:p@host/db?sslmode=require&connection_limit=3",
    );
    expect(url).toContain("connection_limit=3");
  });
});
