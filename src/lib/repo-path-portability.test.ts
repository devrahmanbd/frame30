import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import { join } from "node:path";

/**
 * Every machine checks the repository out to a different absolute path
 * (CI: `~/project`, dev boxes: some local directory). Test and source code
 * must resolve repository files relative to the process working directory
 * (vitest runs with the repo root as cwd, both locally and on CI) — a
 * hard-coded checkout path passes on the machine that wrote it and fails
 * with ENOENT everywhere else. The `unit-contract` CI context stayed red
 * for three pushes on exactly this drift, so it gets a guard.
 *
 * The needle is assembled at runtime so this file itself does not contain
 * the contiguous machine path it bans.
 */
const MACHINE_CHECKOUT = "/opt/" + "frame28";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const path = join(dir, name);
    if (fs.statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

describe("repo path portability", () => {
  it("no file under src/ hard-codes a machine-specific checkout path", () => {
    const offenders = walk("src").filter((file) =>
      fs.readFileSync(file, "utf8").includes(MACHINE_CHECKOUT),
    );
    expect(
      offenders,
      "resolve repo files relative to cwd — absolute checkout paths pass locally and fail on CI",
    ).toEqual([]);
  });
});
