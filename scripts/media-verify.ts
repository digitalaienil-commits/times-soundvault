import { spawnSync } from "node:child_process";
import { parseMediaConfig } from "@/lib/media/config";
import { getScriptEnvironment } from "./environment";

getScriptEnvironment();
parseMediaConfig();
for (const command of ["ffmpeg", "ffprobe", "unzip"]) {
  const result = spawnSync(command, ["-version"], { stdio: "ignore" });
  if (result.status !== 0) throw new Error(`${command} is required`);
}
const encoders = spawnSync("ffmpeg", ["-hide_banner", "-encoders"], {
  encoding: "utf8",
});
if (!encoders.stdout.includes("libmp3lame"))
  throw new Error("FFmpeg libmp3lame encoder is required");
console.info("Media tools and server-only configuration verified.");
