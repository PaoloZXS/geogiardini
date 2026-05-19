import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const windowsShell =
  process.platform === "win32"
    ? path.join(process.env.WINDIR || "C:\\Windows", "System32", "cmd.exe")
    : undefined;
const envFile = path.join(root, ".env.local");
const localEnv = fs.existsSync(envFile)
  ? Object.fromEntries(
      fs
        .readFileSync(envFile, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const index = line.indexOf("=");
          if (index === -1) return [line, ""];
          const key = line.slice(0, index);
          const value = line.slice(index + 1);
          return [key, value];
        })
    )
  : {};

function spawnProcess(name, args) {
  const childEnv = { ...process.env, ...localEnv };
  const child =
    process.platform === "win32"
      ? spawn(
          windowsShell,
          ["/d", "/s", "/c", `${npmCommand} ${args.join(" ")}`],
          {
            cwd: root,
            stdio: "inherit",
            env: childEnv
          }
        )
      : spawn(npmCommand, args, {
          cwd: root,
          stdio: "inherit",
          env: childEnv
        });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`${name} terminated with signal ${signal}`);
    } else {
      console.log(`${name} exited with code ${code}`);
    }
    process.exit(code ?? 0);
  });

  return child;
}

console.log("Starting local development environment...");
spawnProcess("Backend", ["run", "server"]);
spawnProcess("Frontend", ["run", "dev"]);
