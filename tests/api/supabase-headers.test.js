import { describe, expect, it } from "vitest";
import { supabaseServiceHeaders } from "../../api/_supabase.js";

describe("Supabase service headers", () => {
  it("sends an opaque secret key only as apikey", () => {
    expect(supabaseServiceHeaders("sb_secret_example")).toEqual({
      apikey: "sb_secret_example",
    });
  });

  it("keeps legacy service-role JWT compatibility", () => {
    expect(supabaseServiceHeaders("legacy-jwt")).toEqual({
      apikey: "legacy-jwt",
      Authorization: "Bearer legacy-jwt",
    });
  });

  it("fails closed without server configuration", () => {
    expect(() => supabaseServiceHeaders("")).toThrow("Missing Supabase service configuration");
  });
});
