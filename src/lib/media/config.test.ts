import { describe, expect, it } from "vitest";

import { parseMediaConfig } from "./config";

describe("media configuration", () => {
  it("keeps development defaults bounded and private", () => {
    const config = parseMediaConfig({ NODE_ENV: "test" });
    expect(config.profileVersion).toBe(1);
    expect(config.tempRoot).not.toContain("/public/");
  });

  it("rejects silent production defaults and public media variables", () => {
    expect(() => parseMediaConfig({ NODE_ENV: "production" })).toThrow(
      "MEDIA_TEMP_ROOT is required in production",
    );
    expect(() =>
      parseMediaConfig({
        NODE_ENV: "test",
        NEXT_PUBLIC_MEDIA_TOKEN: "forbidden",
      }),
    ).toThrow("Media configuration must remain server-only");
  });
});
