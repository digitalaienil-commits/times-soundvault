import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

/**
 * Obtains the YouTube refresh token the copyright provider needs.
 *
 * Google issues a refresh token only through an interactive consent, so this
 * runs a throwaway local callback server, sends the operator to Google once,
 * and prints the token. It writes nothing: the value goes into `.env.local` by
 * hand, like every other secret here.
 *
 * A refresh token is a long-lived credential for the account that approved it.
 * It is printed to this terminal and nowhere else — never commit it, never
 * paste it into chat or email.
 */
const DEFAULT_PORT = 4545;

/**
 * Read-only is enough to prove the client, the secret and the consent work.
 * The real integration also uploads a private reference video and reads
 * partner claims, so `--full` asks for those too — but a Google account with
 * no CMS access cannot consent to `youtubepartner`, which is exactly why the
 * connectivity test and the Content ID test are separate steps.
 */
const READONLY_SCOPES = ["https://www.googleapis.com/auth/youtube.readonly"];
const FULL_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtubepartner",
];

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is required. Add it to .env.local before running this.`,
    );
  }
  return value;
}

function argument(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const clientId = required("YOUTUBE_CLIENT_ID");
  const clientSecret = required("YOUTUBE_CLIENT_SECRET");
  const port = Number(
    argument("--port") ?? process.env.YOUTUBE_OAUTH_PORT ?? DEFAULT_PORT,
  );
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`Invalid port: ${port}`);
  }
  const redirectUri = `http://localhost:${port}/oauth2callback`;
  const scopes = process.argv.includes("--full")
    ? FULL_SCOPES
    : READONLY_SCOPES;

  // Google rejects a redirect URI that is not registered on the OAuth client,
  // so say which one this run will send before the browser opens.
  console.log(`Redirect URI for this run: ${redirectUri}`);
  console.log(
    "It must be listed under Authorized redirect URIs on the OAuth client.\n",
  );
  console.log(`Scopes requested:\n  ${scopes.join("\n  ")}\n`);

  // The state parameter ties the callback to this process, so a stray request
  // to the callback port cannot hand us somebody else's code.
  const state = randomBytes(16).toString("hex");
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes.join(" "));
  // Without offline access and a forced consent screen Google returns an
  // access token only, and the refresh token — the point of this exercise —
  // never appears.
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  const result = await new Promise<{ code: string }>((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", `http://localhost:${port}`);
      if (url.pathname !== "/oauth2callback") {
        response.writeHead(404).end("Not found");
        return;
      }
      const error = url.searchParams.get("error");
      if (error) {
        response.writeHead(400).end(`Authorization failed: ${error}`);
        server.close();
        reject(new Error(`Google returned "${error}"`));
        return;
      }
      if (url.searchParams.get("state") !== state) {
        response.writeHead(400).end("State mismatch. Nothing was accepted.");
        return;
      }
      const code = url.searchParams.get("code");
      if (!code) {
        response.writeHead(400).end("No authorization code in the callback.");
        return;
      }
      response
        .writeHead(200, { "content-type": "text/plain" })
        .end("YouTube authorized. The refresh token is in your terminal.");
      server.close();
      resolve({ code });
    });
    server.on("error", (serverError: NodeJS.ErrnoException) => {
      reject(
        serverError.code === "EADDRINUSE"
          ? new Error(
              `Port ${port} is already in use (the dev server runs on 3000). ` +
                `Re-run with --port <free port> and register that redirect URI.`,
            )
          : serverError,
      );
    });
    server.listen(port, () => {
      console.log("Open this URL in the browser signed in to the channel:\n");
      console.log(`${authUrl.toString()}\n`);
      console.log("Waiting for the callback…");
    });
  });

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: result.code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const tokens = (await tokenResponse.json()) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!tokenResponse.ok) {
    throw new Error(
      `Token exchange failed (${tokenResponse.status}): ${
        tokens.error_description ?? tokens.error ?? "unknown error"
      }`,
    );
  }
  if (!tokens.refresh_token) {
    throw new Error(
      "Google returned no refresh token. This happens when the account has " +
        "already consented to this client: revoke it at " +
        "https://myaccount.google.com/permissions and run this again.",
    );
  }

  // Proving the token works is the point; an unexercised credential is a
  // guess. The access token stays out of the output — only the refresh token
  // is needed, and only once.
  const channels = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true",
    { headers: { authorization: `Bearer ${tokens.access_token}` } },
  );
  const channelBody = (await channels.json()) as {
    items?: { id: string; snippet?: { title?: string } }[];
    error?: { message?: string };
  };

  console.log("\n--- Authorized ---");
  console.log(`Granted scopes: ${tokens.scope ?? "(none reported)"}`);
  if (channels.ok && channelBody.items?.length) {
    for (const item of channelBody.items) {
      console.log(
        `Channel: ${item.snippet?.title ?? "(untitled)"}  id=${item.id}`,
      );
    }
    console.log("YouTube Data API access confirmed with a real call.");
  } else {
    console.log(
      `Channel lookup failed: ${channelBody.error?.message ?? channels.status}`,
    );
    console.log(
      "The token was issued but has not been proven against the API.",
    );
  }

  console.log("\nAdd this to .env.local (treat it as a password):\n");
  console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  console.log(
    "This proves YouTube Data API OAuth only. Content ID is a separate,\n" +
      "partner-level capability: keep COPYRIGHT_PROVIDER=manual_youtube and\n" +
      "YOUTUBE_CONTENT_ID_DRY_RUN=true until a real CMS operation succeeds.",
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "YouTube authorization failed",
  );
  process.exitCode = 1;
});
