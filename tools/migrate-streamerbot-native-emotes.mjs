import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const targets = [
  {
    actionId: "5b43c53a-1e4b-5608-b343-5f88c2884677",
    subActionId: "d92f9b5c-98a1-55e8-8baf-ed6625a56b70",
    name: "THSV Twitch - Intake",
    triggerCount: 11,
  },
  {
    actionId: "38df4ccc-2d85-5a9d-8fa6-6711f513c2bd",
    subActionId: "b86a8912-505e-521b-b1e6-af594ad43f90",
    name: "THSV YouTube - Intake",
    triggerCount: 10,
  },
  {
    actionId: "a6b02419-c344-5853-8166-eb6b6adb02d7",
    subActionId: "617795f3-c965-5af5-b7f4-0e873d2c8c1f",
    name: "THSV Kick - Intake",
    triggerCount: 10,
  },
];

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

const actionsPath = readArgument("--actions");
const sourcePath = readArgument("--source");
const backupRoot = readArgument("--backup-root");
const write = process.argv.includes("--write");

if (!actionsPath || !sourcePath || (write && !backupRoot)) {
  throw new Error(
    "Usage: node migrate-streamerbot-native-emotes.mjs --actions <actions.json> --source <RelayPlatform.cs> [--backup-root <dir> --write]",
  );
}

const [raw, source] = await Promise.all([
  fs.readFile(actionsPath, "utf8"),
  fs.readFile(sourcePath, "utf8"),
]);
const hasBom = raw.charCodeAt(0) === 0xfeff;
const jsonText = hasBom ? raw.slice(1) : raw;
const document = JSON.parse(jsonText);
const actions = Array.isArray(document) ? document : document.actions;
assert.ok(Array.isArray(actions), "Streamer.bot action store has no action array");

const oldByteCode = new Map();
const encodedSource = Buffer.from(source, "utf8").toString("base64");
const report = [];

for (const target of targets) {
  const matchingActions = actions.filter((action) => action.id === target.actionId);
  assert.equal(matchingActions.length, 1, `Expected one action ${target.actionId}`);
  const action = matchingActions[0];
  assert.equal(action.name, target.name, `Unexpected name for ${target.actionId}`);
  assert.equal(
    action.triggers?.length,
    target.triggerCount,
    `Unexpected trigger count for ${target.name}`,
  );

  const matchingSubActions = (action.subActions ?? []).filter(
    (subAction) => subAction.id === target.subActionId,
  );
  assert.equal(
    matchingSubActions.length,
    1,
    `Expected one code sub-action for ${target.name}`,
  );
  const subAction = matchingSubActions[0];
  assert.equal(subAction.type, 99999, `Unexpected code sub-action type for ${target.name}`);
  assert.equal(typeof subAction.byteCode, "string", `Missing byteCode for ${target.name}`);

  oldByteCode.set(target.subActionId, subAction.byteCode);
  subAction.byteCode = encodedSource;
  report.push({
    action: target.name,
    actionId: target.actionId,
    subActionId: target.subActionId,
    triggerCount: action.triggers.length,
    changed: oldByteCode.get(target.subActionId) !== encodedSource,
    oldSourceSha256: sha256(Buffer.from(oldByteCode.get(target.subActionId), "base64")),
    newSourceSha256: sha256(source),
  });
}

// Prove that the proposed document differs only in the three reviewed code fields.
const comparison = JSON.parse(JSON.stringify(document));
const comparisonActions = Array.isArray(comparison) ? comparison : comparison.actions;
for (const target of targets) {
  const action = comparisonActions.find((item) => item.id === target.actionId);
  const subAction = action.subActions.find((item) => item.id === target.subActionId);
  subAction.byteCode = oldByteCode.get(target.subActionId);
}
assert.deepEqual(comparison, JSON.parse(jsonText), "Migration would change unrelated action data");

let backupDirectory;
if (write) {
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  backupDirectory = path.join(backupRoot, `native-emotes-${stamp}`);
  await fs.mkdir(backupDirectory, { recursive: true });
  await fs.copyFile(actionsPath, path.join(backupDirectory, "actions.json"));

  const companionBackup = `${actionsPath}.bak`;
  try {
    await fs.copyFile(companionBackup, path.join(backupDirectory, "actions.json.bak"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const serialized = `${hasBom ? "\ufeff" : ""}${JSON.stringify(document)}`;
  const temporaryPath = `${actionsPath}.thsv-${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, serialized, { encoding: "utf8", flag: "wx" });
  const temporaryRaw = await fs.readFile(temporaryPath, "utf8");
  const verification = JSON.parse(
    temporaryRaw.charCodeAt(0) === 0xfeff ? temporaryRaw.slice(1) : temporaryRaw,
  );
  assert.deepEqual(verification, document, "Temporary action store failed verification");
  await fs.rename(temporaryPath, actionsPath);
}

process.stdout.write(
  `${JSON.stringify(
    {
      mode: write ? "write" : "dry-run",
      actionsPath,
      sourcePath,
      sourceSha256: sha256(source),
      backupDirectory,
      targets: report,
    },
    null,
    2,
  )}\n`,
);
