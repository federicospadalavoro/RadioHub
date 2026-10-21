import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const compose = ["compose", "-p", "radiohub-e2e", "-f", "e2e/compose.yaml"];
function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
try {
  if (run("docker", [...compose, "up", "-d", "--wait"])) process.exitCode = 1;
  else
    process.exitCode = run(process.execPath, [
      "node_modules/@playwright/test/cli.js",
      "test",
      ...process.argv.slice(2),
    ]);
} finally {
  if (run("docker", [...compose, "down", "-v"])) process.exitCode = 1;
}
