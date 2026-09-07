import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const requireModule = createRequire(import.meta.url);
const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production" };
async function run(args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: "inherit", env });
    const stop = () => child.kill("SIGTERM");
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    child.once("error", reject);
    child.once("exit", (code) => {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
      resolve(code ?? 1);
    });
  });
}
async function main() {
  const migrated = await run([
    "--import",
    pathToFileURL(requireModule.resolve("tsx")).href,
    fileURLToPath(new URL("./migrate.ts", import.meta.url)),
  ]);
  if (migrated !== 0) {
    process.exitCode = migrated;
    return;
  }
  process.exitCode = await run([
    requireModule.resolve("next/dist/bin/next"),
    "start",
    ...process.argv.slice(2),
  ]);
}
main().catch(() => {
  console.error("Splatify startup failed.");
  process.exitCode = 1;
});
