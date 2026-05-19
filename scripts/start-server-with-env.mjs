import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
          const key = line.slice(0, index).trim();
          let value = line.slice(index + 1).trim();
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
          } else if (value.startsWith("'") && value.endsWith("'")) {
            value = value.slice(1, -1);
          }
          return [key, value];
        })
    )
  : {};

const tsNodeBin = path.join(
  root,
  "node_modules",
  ".bin",
  `ts-node${process.platform === "win32" ? ".cmd" : ""}`
);
const childEnv = { ...process.env, ...localEnv };

const child = spawn(tsNodeBin, ["server.ts"], {
  cwd: root,
  stdio: "inherit",
  env: childEnv,
  windowsHide: true,
  shell: process.platform === "win32"
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.log(`Server process terminated with signal ${signal}`);
  } else {
    process.exit(code ?? 0);
  }
});
