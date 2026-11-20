import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import copilot from "../providers/copilot.js";
import { HERE, MOD, NOW } from "./_util.js";

const FAKE_GH = join(HERE, "fake-cli", "gh");
const LOGIN_SHELL = join(HERE, "fake-cli", "login-shell");
const RESET = Date.UTC(2026, 11, 1) / 1000;
const reply = (o) => JSON.stringify({ plan: "business", reset: "2026-12-01T00:00:00Z", ...o });

function helper(env) {
  return spawnSync("sh", [join(MOD, "helpers", "copilot-usage.sh")], {
    env: { ...process.env, HERDR_USAGE_GH_BIN: FAKE_GH, SHELL: LOGIN_SHELL, GH_TOKEN: "", GITHUB_TOKEN: "", ...env },
    encoding: "utf8",
    timeout: 30000,
  });
}

test("descriptor", () => {
  assert.equal(copilot.id, "copilot");
  assert.equal(copilot.icon, "icons/copilot.svg");
  assert.equal(copilot.helper, "helpers/copilot-usage.sh");
});

test("premium requests → 'prem' used percent, monthly, resetting on the 1st", () => {
  const r = copilot.parse(reply({ quotas: { premium_interactions: { entitlement: 12500, remaining: 4279, percent_remaining: 34.2 } } }), NOW);
  assert.equal(r.status, "ok");
  assert.equal(r.plan, "business");
  assert.deepEqual(r.windows.map((w) => [w.id, w.short, w.long, w.resetsAt, w.durationSec]), [
    ["premium_interactions", "prem", "Premium requests", RESET, 30 * 86400],
  ]);
  assert.equal(r.windows[0].percent, 66, "100 − 34.2, rounded");
});

test("unlimited quotas are left out; none left → unavailable", () => {
  const quotas = { chat: { unlimited: true, percent_remaining: 100 }, completions: { unlimited: true, percent_remaining: 100 } };
  const r = copilot.parse(reply({ quotas }), NOW);
  assert.equal(r.status, "unavailable");
  const both = copilot.parse(reply({ quotas: { ...quotas, premium_interactions: { percent_remaining: 90 } } }), NOW);
  assert.deepEqual(both.windows.map((w) => w.short), ["prem"]);
});

test("helper error line → its message; nothing → 'No reply from gh'", () => {
  const r = copilot.parse('{"error":"gh is not signed in: run gh auth login"}', NOW);
  assert.equal(r.status, "error");
  assert.equal(r.message, "gh is not signed in: run gh auth login");
  assert.equal(copilot.parse("", NOW).message, "No reply from gh");
});

test("helper: bogus bin → exit 127", () => {
  const r = helper({ HERDR_USAGE_GH_BIN: "/nonexistent/gh" });
  assert.equal(r.status, 127);
  assert.equal(r.stdout, "");
});

test("helper: signed in → exit 0 with the reply line", () => {
  const r = helper({ FAKE_GH: "ok" });
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).plan, "business");
});

test("helper: no Copilot (HTTP 404) → exit 127", () => {
  assert.equal(helper({ FAKE_GH: "missing" }).status, 127);
});

test("helper: token only in the login shell → $SHELL -ilc only prints it, gh runs outside with GH_TOKEN", () => {
  const r = helper({ FAKE_GH: "token" });
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).quotas.premium_interactions.percent_remaining, 34.2);
});

test("helper: rc files printing on stdout don't spoil the token", () => {
  const r = helper({ FAKE_GH: "token", FAKE_LOGIN_SHELL: "noisy" });
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).plan, "business");
});

test("helper: a login shell that never returns is cut off → not-signed-in error, exit 1", () => {
  const started = Date.now();
  const r = helper({ FAKE_GH: "token", FAKE_LOGIN_SHELL: "hangs" });
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).error, "gh is not signed in: run gh auth login");
  assert.ok(Date.now() - started < 20000, "bounded by the login-shell deadline");
});

test("helper: not signed in anywhere → error line, exit 1", () => {
  const r = helper({ FAKE_GH: "signedout" });
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).error, "gh is not signed in: run gh auth login");
});
