import { describe, expect, it } from "vitest";
import { readAuthToken, signAuthToken } from "./auth";

describe("session tokens", () => {
  it("reads a valid session token from a cookie header", () => {
    const user = { id: "user-1", phone: "5533772732", role: "member" as const };
    const token = signAuthToken(user);

    expect(readAuthToken(`theme=light; sr_session=${token}; other=value`)).toMatchObject(user);
  });

  it("rejects an invalid token", () => {
    expect(readAuthToken("sr_session=not-a-token")).toBeNull();
  });
});
