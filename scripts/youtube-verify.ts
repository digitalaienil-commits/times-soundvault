import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

/**
 * Checks the stored YouTube credentials against the live API.
 *
 * `youtube:authorize` proves the token once, at the moment it is issued. This
 * re-proves it on demand — after it moves to another environment, or when
 * something stops working — without another consent screen.
 *
 * It reads and reports; it uploads nothing and claims nothing. Content ID is
 * deliberately out of scope: see the closing note.
 */
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set in the environment.`);
  return value;
}

async function main() {
  const clientId = required("YOUTUBE_CLIENT_ID");
  const clientSecret = required("YOUTUBE_CLIENT_SECRET");
  const refreshToken = required("YOUTUBE_REFRESH_TOKEN");

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const tokens = (await tokenResponse.json()) as {
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenResponse.ok || !tokens.access_token) {
    throw new Error(
      `Refresh failed (${tokenResponse.status}): ${
        tokens.error_description ?? tokens.error ?? "unknown error"
      }`,
    );
  }
  console.log("Refresh token exchanged for an access token.");
  console.log(`Granted scopes: ${tokens.scope ?? "(none reported)"}`);

  const channels = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true",
    { headers: { authorization: `Bearer ${tokens.access_token}` } },
  );
  const body = (await channels.json()) as {
    items?: { id: string; snippet?: { title?: string } }[];
    error?: { message?: string };
  };
  if (!channels.ok) {
    throw new Error(
      `Channel lookup failed (${channels.status}): ${
        body.error?.message ?? "unknown error"
      }`,
    );
  }
  if (!body.items?.length) {
    throw new Error(
      "The token is valid but the account owns no channel. Authorize with the " +
        "account that owns the test channel.",
    );
  }
  for (const item of body.items) {
    console.log(
      `Channel: ${item.snippet?.title ?? "(untitled)"}  id=${item.id}`,
    );
  }

  const expected = process.env.YOUTUBE_TEST_CHANNEL_ID?.trim();
  if (expected && !body.items.some((item) => item.id === expected)) {
    console.log(
      `\nWarning: YOUTUBE_TEST_CHANNEL_ID=${expected} is not among the channels ` +
        "this token can act on.",
    );
  }

  const scopes = (tokens.scope ?? "").split(/\s+/).filter(Boolean);
  const partner = scopes.includes(
    "https://www.googleapis.com/auth/youtubepartner",
  );
  console.log("\nYouTube Data API access verified with a real call.");
  console.log(
    partner
      ? "The youtubepartner scope is granted, which is necessary for Content ID\n" +
          "but not sufficient: a CMS operation still has to succeed against a real\n" +
          "content owner before the provider leaves dry run."
      : "The youtubepartner scope is NOT granted, so this token cannot touch\n" +
          "Content ID at all. Keep COPYRIGHT_PROVIDER=manual_youtube and\n" +
          "YOUTUBE_CONTENT_ID_DRY_RUN=true.",
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "YouTube verification failed",
  );
  process.exitCode = 1;
});
