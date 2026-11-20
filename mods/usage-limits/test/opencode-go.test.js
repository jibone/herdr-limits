import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import opencodeGo from "../providers/opencode-go.js";
import { HERE, MOD, NOW, read } from "./_util.js";

const FAKE_OPENCODE = join(HERE, "fake-cli", "opencode");
const DAY = 86400;
const reply = (go) => JSON.stringify({ location: { directory: "/home/demo" }, data: { workspace: { id: "w", usageURL: "u" }, go, budgets: [] } });
const meter = (percent, resetsAt, limited = false) => ({ percent, limited, resetsAt });

function helper(env) {
  return spawnSync("sh", [join(MOD, "helpers", "opencode-go-limits.sh")], {
    env: { ...process.env, HERDR_USAGE_OPENCODE_BIN: FAKE_OPENCODE, ...env },
    encoding: "utf8",
    timeout: 40000,
  });
}

test("descriptor: a limits provider drawn with Herdr's OpenCode glyph", () => {
  assert.equal(opencodeGo.id, "opencode-go");
  assert.equal(opencodeGo.icon, "icons/opencode.svg");
  assert.equal(opencodeGo.helper, "helpers/opencode-go-limits.sh");
  assert.equal(opencodeGo.kind, undefined);
});

test("Go's three meters → 5h, wk, mo windows; resets from ms; Go is the plan badge", () => {
  const r = opencodeGo.parse(read("opencode-go-limits.json"), NOW);
  assert.equal(r.status, "ok");
  assert.equal(r.plan, "Go");
  assert.deepEqual(r.windows.map((w) => [w.id, w.short, w.long, w.percent, w.resetsAt, w.durationSec]), [
    ["rolling", "5h", "5-hour", 42, 1793786400, 5 * 3600],
    ["weekly", "wk", "Weekly", 63, 1794038400, 7 * DAY],
    ["monthly", "mo", "Monthly", 22, 1796083200, 30 * DAY],
  ]);
});

test("a monthly reset off the 1st counts as 30 days; one on the 1st as the month before it", () => {
  const offFirst = opencodeGo.parse(reply({ monthly: meter(10, 1795046400000) }), NOW);
  assert.equal(offFirst.windows[0].durationSec, 30 * DAY);
  const jan1 = opencodeGo.parse(reply({ monthly: meter(10, Date.UTC(2027, 0, 1)) }), NOW);
  assert.equal(jan1.windows[0].durationSec, 31 * DAY, "December");
});

test("a limited meter reads as full even when its percent lags", () => {
  const r = opencodeGo.parse(reply({ rolling: meter(97.2, 1793786400000, true), weekly: meter(50, 1794038400000) }), NOW);
  assert.deepEqual(r.windows.map((w) => w.percent), [100, 50]);
});

test("meters without a number are left out; none left → unavailable", () => {
  const r = opencodeGo.parse(reply({ rolling: { limited: false, resetsAt: 1 } }), NOW);
  assert.equal(r.status, "unavailable");
});

test("server error message → its text; nothing → 'No reply from OpenCode'", () => {
  const r = opencodeGo.parse('{"message":"OpenCode Console usage limits timed out","service":"opencode"}', NOW);
  assert.equal(r.status, "error");
  assert.equal(r.message, "OpenCode Console usage limits timed out");
  assert.equal(opencodeGo.parse("", NOW).message, "No reply from OpenCode");
});

test("helper: bogus bin → exit 127", () => {
  const r = helper({ HERDR_USAGE_OPENCODE_BIN: "/nonexistent/opencode" });
  assert.equal(r.status, 127);
  assert.equal(r.stdout, "");
});

test("helper: Go subscriber → exit 0 with the reply line", () => {
  const r = helper({});
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).data.go.weekly.percent, 63);
});

test("helper: not signed in to OpenCode Console, or no Go in the workspace → exit 127, nothing printed", () => {
  for (const mode of ["signedout", "nogo"]) {
    const r = helper({ FAKE_OPENCODE_GO: mode });
    assert.equal(r.status, 127, mode);
    assert.equal(r.stdout, "", mode);
  }
});

test("helper: Console unavailable → its error line, exit 1", () => {
  const r = helper({ FAKE_OPENCODE_GO: "down" });
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).message, "OpenCode Console usage limits timed out");
});

test("helper: a server that never answers is cut off → exit 1, nothing printed", () => {
  const started = Date.now();
  const r = helper({ FAKE_OPENCODE_GO: "hang" });
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "");
  assert.ok(Date.now() - started < 30000, "bounded by the helper's deadline");
});
