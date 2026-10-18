import { execSync } from "node:child_process";
import { chmodSync, readFileSync, rmSync, writeFileSync } from "node:fs";

// Compiles server/ to plain JS in dist-server/, the md-display command in the
// release package. Run by `npm run build`, which puts tsc on the PATH.

const OUT = "dist-server";

rmSync(OUT, { recursive: true, force: true });
execSync("tsc -p tsconfig.server.build.json", { stdio: "inherit" });

// The source's shebang hides Node's warning about stripping types; the
// compiled JS has none to strip, so it needs only a plain one.
const cli = `${OUT}/cli.js`;
writeFileSync(cli, readFileSync(cli, "utf8").replace(/^#!.*/, "#!/usr/bin/env node"));
chmodSync(cli, 0o755);
