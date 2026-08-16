// loop-workspace-prepare.ts
import { cli, Strategy } from "@jackwener/opencli/registry";

// src/lib/commands.ts
import { ArgumentError as ArgumentError3, CommandExecutionError as CommandExecutionError5 } from "@jackwener/opencli/errors";

// src/lib/schemas.ts
import { z } from "zod";
var id = z.string().min(1);
var hash = z.string().min(8);
var receiptSchema = z.object({
  eventId: id,
  idempotencyKey: id,
  status: z.enum(["pending", "committed", "rejected"]),
  ingressSequence: z.number().int().positive(),
  ledgerRevision: z.number().int().nonnegative().optional(),
  rejectionCode: id.optional(),
  conflictId: id.optional()
}).passthrough();
var tickSchema = z.object({
  processed: z.number().int().nonnegative(),
  receipts: z.array(receiptSchema),
  effects: z.object({
    satisfied: z.number().int().nonnegative(),
    retried: z.number().int().nonnegative(),
    obsolete: z.number().int().nonnegative(),
    ownerMismatch: z.boolean()
  }).strict()
}).strict();
var row = z.object({ workItemId: id, revision: z.number().int().positive(), state: id, loopId: id, profileId: id }).passthrough();
var statusCandidate = z.object({ candidateId: id, workItemId: id, workItemRevision: z.number().int().positive(), repository: id, prNumber: z.number().int().positive(), headSha: id, digest: hash }).strict();
var action = z.object({ actionId: id, actionKey: id, kind: z.enum(["preflight_attempt", "execute_attempt", "recover_attempt", "review_candidate", "plan_next"]), state: id, workItemId: id, workItemRevision: z.number().int().positive() }).passthrough();
var statusSchema = z.object({
  ownerUid: id,
  ledgerRevision: z.number().int().nonnegative(),
  inbox: z.array(z.unknown()),
  ingressConflicts: z.unknown(),
  outbox: z.array(z.unknown()),
  workItems: z.array(row),
  attempts: z.array(z.unknown()),
  candidates: z.array(statusCandidate),
  actions: z.array(action)
}).passthrough();
var packetBase = {
  kind: z.enum(["preflight_attempt", "execute_attempt", "recover_attempt", "review_candidate", "plan_next"]),
  schema: z.literal("loopctl-action-packet-v1"),
  actionId: id,
  actionKey: id,
  workItemId: id,
  workItemRevision: z.number().int().positive(),
  targetPrincipal: id,
  targetTopicId: id,
  targetDigest: hash,
  packetDigest: hash,
  action: z.object({ id, key: id, kind: z.string(), state: id, workItemRevision: z.number().int().positive(), targetPrincipal: id, targetTopicId: id, targetDigest: hash }).strict(),
  contracts: z.object({ taskContractHash: hash, referenceSnapshotHash: hash, writeScopeHash: hash, acceptanceContractHash: hash }).strict()
};
var attemptPacket = z.object({ ...packetBase, kind: z.enum(["preflight_attempt", "execute_attempt"]), loopId: id, profileId: id, workerTopicId: id, evidenceTopicId: id.optional(), githubRepo: id, writeScope: z.array(id), attemptId: id, attemptNumber: z.number().int().positive(), generation: z.number().int().nonnegative(), runtimePrincipal: id, leaseExpiresAt: z.string().datetime(), proofMode: z.enum(["ed25519", "catsco-message"]), workBundle: z.record(z.string(), z.unknown()) }).passthrough();
var recoveryPacket = z.object({ ...packetBase, kind: z.literal("recover_attempt"), loopId: id, profileId: id, githubRepo: id, catscoProjectId: id, workerTopicId: id, evidenceTopicId: id.optional(), stewardPrincipal: id, stewardTopicId: id, previousAttempt: z.object({ attemptId: id, attemptNumber: z.number().int().positive(), generation: z.number().int().nonnegative(), controlState: id, reportedState: id, leaseExpiresAt: z.string().datetime(), runtimePrincipal: id, workBundle: z.record(z.string(), z.unknown()) }).strict(), recovery: z.object({ requireFreshWorkerTopic: z.literal(true), requireFreshEvidenceTopic: z.literal(true), requireFreshStewardTopic: z.literal(true), requireFreshWorktree: z.literal(true), requireFreshWorkspaceLease: z.literal(true) }).strict() }).passthrough();
var reviewPacket = z.object({ ...packetBase, kind: z.literal("review_candidate"), loopId: id, profileId: id, githubRepo: id, stewardPrincipal: id, stewardTopicId: id, evidenceTopicId: id.optional(), acceptanceContractHash: hash, candidate: z.object({ candidateId: id, attemptId: id, generation: z.number().int().nonnegative(), deliverable: z.record(z.string(), z.unknown()), digest: hash, trustedEvidence: z.record(z.string(), z.unknown()) }).nullable() }).passthrough();
var nextPacket = z.object({ ...packetBase, kind: z.literal("plan_next"), loopId: id, profileId: id, terminalState: z.enum(["accepted", "closed"]), completedWorkItem: z.object({ workItemId: id, revision: z.number().int().positive(), state: z.enum(["accepted", "closed"]) }).strict(), currentCandidate: z.record(z.string(), z.unknown()).nullable(), outcomeContext: z.record(z.string(), z.unknown()) }).passthrough();
var actionPacketSchema = z.discriminatedUnion("kind", [attemptPacket, recoveryPacket, reviewPacket, nextPacket]);
var workerPreflightPacketSchema = z.object({
  kind: z.literal("preflight_attempt"),
  schema: z.literal("loopctl-action-packet-v1"),
  actionId: id,
  actionKey: id,
  action: z.object({ id, key: id, kind: z.literal("preflight_attempt"), state: z.literal("ready"), workItemRevision: z.number().int().positive(), targetPrincipal: id, targetTopicId: id, targetDigest: hash }).strict(),
  workItemId: id,
  workItemRevision: z.number().int().positive(),
  targetPrincipal: id,
  targetTopicId: id,
  targetDigest: hash,
  packetDigest: hash,
  contracts: z.object({ taskContractHash: hash, referenceSnapshotHash: hash, writeScopeHash: hash, acceptanceContractHash: hash }).strict(),
  ownerUid: id,
  loopId: id,
  profileId: id,
  catscoProjectId: id,
  workerTopicId: id,
  evidenceTopicId: id,
  workerSessionId: id,
  githubRepo: id,
  writeScope: z.array(id),
  attemptId: id,
  attemptNumber: z.number().int().positive(),
  generation: z.number().int().nonnegative(),
  runtimePrincipal: id,
  leaseExpiresAt: z.string().datetime(),
  proofMode: z.literal("catsco-message"),
  proofKeyId: id.optional(),
  proofPublicKey: id.optional(),
  controllerSignatureAlgorithm: z.literal("ed25519"),
  controllerKeyId: id,
  controllerPublicKey: z.string().min(1),
  controllerSignature: z.string().min(1),
  workBundle: z.object({ contractDigest: hash, instructions: id, deliverables: z.array(id) }).strict()
}).strict();

// src/lib/events.ts
import { z as z2 } from "zod";
var id2 = z2.string().min(1);
var hash2 = z2.string().min(8);
var base = { eventId: id2, idempotencyKey: id2, source: id2, entityRef: id2 };
var contracts = { taskContractHash: hash2, referenceSnapshotHash: hash2, writeScopeHash: hash2, acceptanceContractHash: hash2 };
var deliverable = z2.object({ kind: z2.literal("github_pr"), repository: id2, prNumber: z2.number().int().positive(), headSha: id2, baseSha: id2, digest: hash2 }).strict();
var registered = z2.object({ ...base, type: z2.literal("work_item_registered"), payload: z2.object({ workItemId: id2, loopId: id2, profileId: id2, terminalState: z2.enum(["accepted", "closed"]), ...contracts, writeScope: z2.array(id2), githubRepo: id2, catscoProjectId: id2, workerTopicId: id2, evidenceTopicId: id2.optional(), stewardTopicId: id2, stewardPrincipal: id2.optional(), coordinatorSessionId: id2.optional(), coordinatorSessionTopicId: id2.optional() }).strict() }).strict();
var worktreeContract = z2.object({ repository: id2, baseRevision: id2, branchName: id2, worktreePath: id2, gitDir: id2.optional(), cleanupPolicy: z2.enum(["retain-until-review", "retain-until-integration", "remove-after-candidate"]), workspaceLease: id2 }).strict();
var worktreeContractSchema = worktreeContract;
var attemptRoute = z2.object({ catscoProjectId: id2, workerTopicId: id2, evidenceTopicId: id2, stewardTopicId: id2, stewardPrincipal: id2, workerSessionId: id2, coordinatorSessionId: id2, coordinatorSessionTopicId: id2 }).strict();
var bundlePayload = z2.object({ workItemId: id2, expectedRevision: z2.number().int().positive(), attemptId: id2, attemptNumber: z2.number().int().positive(), generation: z2.number().int().nonnegative(), runtimePrincipal: id2, workerSessionId: id2.optional(), proofMode: z2.enum(["ed25519", "catsco-message"]).optional(), proofKeyId: id2.optional(), proofPublicKey: id2.optional(), leaseExpiresAt: z2.string().datetime(), workBundle: z2.object({ contractDigest: hash2, instructions: id2, deliverables: z2.array(id2) }).strict(), attemptRoute: attemptRoute.optional(), ...contracts }).strict();
var bundle = z2.object({ ...base, type: z2.literal("work_bundle_proposed"), payload: bundlePayload }).strict();
var workerReady = z2.object({ ...base, type: z2.literal("worker_ready"), payload: z2.object({ workItemId: id2, expectedRevision: z2.number().int().positive(), attemptId: id2, generation: z2.number().int().nonnegative(), runtimePrincipal: id2, workerSessionId: id2.optional(), signature: z2.literal("catsco-message-attested") }).strict() }).strict();
var runtimeStarted = z2.object({ ...base, type: z2.literal("runtime_started"), payload: z2.object({ workItemId: id2, expectedRevision: z2.number().int().positive(), attemptId: id2, generation: z2.number().int().nonnegative(), runtimePrincipal: id2, workerSessionId: id2.optional(), signature: z2.literal("catsco-message-attested") }).strict() }).strict();
var attemptTopicId = z2.string().regex(/^(?:p2p_[1-9]\d*_[1-9]\d*|grp_[1-9]\d*)$/, "targetTopicId must be a CatsCo Attempt topic");
var workerReadySubmission = z2.object({ targetTopicId: attemptTopicId, event: workerReady }).strict().superRefine((submission, context) => {
  const payload = submission.event.payload;
  if (submission.event.entityRef !== `attempt:${payload.attemptId}`) context.addIssue({ code: "custom", path: ["event", "entityRef"], message: "worker_ready entityRef must bind its attemptId" });
  if (submission.event.source !== payload.runtimePrincipal) context.addIssue({ code: "custom", path: ["event", "source"], message: "worker_ready source must match runtimePrincipal" });
});
var runtimeStartedSubmission = z2.object({ targetTopicId: attemptTopicId, event: runtimeStarted }).strict().superRefine((submission, context) => {
  const payload = submission.event.payload;
  if (submission.event.entityRef !== `attempt:${payload.attemptId}`) context.addIssue({ code: "custom", path: ["event", "entityRef"], message: "runtime_started entityRef must bind its attemptId" });
  if (submission.event.source !== payload.runtimePrincipal) context.addIssue({ code: "custom", path: ["event", "source"], message: "runtime_started source must match runtimePrincipal" });
});
var candidate = z2.object({ ...base, type: z2.literal("candidate_submitted"), payload: z2.object({ ownerUid: id2, workItemId: id2, workItemRevision: z2.number().int().positive(), attemptId: id2, generation: z2.number().int().nonnegative(), runtimePrincipal: id2, workerSessionId: id2.optional(), candidateId: id2, deliverable, ...contracts, proofMode: z2.enum(["ed25519", "catsco-message"]).optional(), signature: id2.optional() }).strict() }).strict().superRefine((event, context) => {
  if ((event.payload.proofMode ?? "ed25519") === "catsco-message" && !/^catsco-user:[1-9]\d*$/.test(event.payload.runtimePrincipal)) context.addIssue({ code: "custom", path: ["payload", "runtimePrincipal"], message: "CatsCo-message Candidate requires a numeric CatsCo runtime principal" });
});
var candidateSubmission = z2.object({ targetTopicId: attemptTopicId, event: candidate }).strict().superRefine((submission, context) => {
  const payload = submission.event.payload;
  if (submission.event.entityRef !== `attempt:${payload.attemptId}`) context.addIssue({ code: "custom", path: ["event", "entityRef"], message: "Candidate entityRef must bind its attemptId" });
  if (submission.event.source !== payload.runtimePrincipal) context.addIssue({ code: "custom", path: ["event", "source"], message: "Candidate source must match runtimePrincipal" });
});
var review = z2.object({ ...base, type: z2.literal("review_decided"), payload: z2.object({ workItemId: id2, expectedRevision: z2.number().int().positive(), candidateId: id2, outcome: z2.enum(["accepted", "changes_requested"]), reviewerPrincipal: id2, authenticationRef: id2.optional(), reviewerProof: id2.optional(), reviewedHeadSha: id2, reviewedDeliverableDigest: hash2, acceptanceContractHash: hash2 }).strict() }).strict();
var reviewSubmission = z2.object({ targetTopicId: attemptTopicId, event: review }).strict().superRefine((submission, context) => {
  const payload = submission.event.payload;
  if (submission.event.entityRef !== `work_item:${payload.workItemId}`) context.addIssue({ code: "custom", path: ["event", "entityRef"], message: "Review entityRef must bind its workItemId" });
  if (submission.event.source !== payload.reviewerPrincipal) context.addIssue({ code: "custom", path: ["event", "source"], message: "Review source must match reviewerPrincipal" });
});
var planEvent = z2.union([registered, bundle]);
var canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : value;
function canonicalJson(value) {
  return JSON.stringify(canonical(value));
}
var integrationInputs = z2.object({ workItemId: id2, candidateId: id2, repository: id2, prNumber: z2.number().int().positive(), headSha: id2, digest: hash2 }).strict();

// src/lib/loopctl.ts
import { constants as fsConstants } from "node:fs";
import { realpath, lstat, open } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { z as z3 } from "zod";
import { CommandExecutionError } from "@jackwener/opencli/errors";
var MAX_OUTPUT = 2 * 1024 * 1024;
var MAX_INPUT = 512 * 1024;
var jsonValue = z3.unknown();
async function readConfinedFile(file) {
  if (!file || isAbsolute(file)) throw new Error("input file must be relative to the current directory");
  const cwd = resolve(process.cwd());
  const requested = resolve(cwd, file);
  const info = await lstat(requested);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("input file must be a regular non-symlink file");
  const actual = await realpath(requested);
  const rel = relative(cwd, actual);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("input file must remain inside the current directory");
  const handle = await open(requested, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const stat2 = await handle.stat();
    if (!stat2.isFile()) throw new Error("input file must remain a regular file");
    const value = await handle.readFile("utf8");
    if (Buffer.byteLength(value) > MAX_INPUT) throw new Error("input file is too large");
    return value;
  } finally {
    await handle.close();
  }
}

// src/lib/catsco.ts
import { CommandExecutionError as CommandExecutionError2 } from "@jackwener/opencli/errors";
var MAX_OUTPUT2 = 128 * 1024;

// src/lib/catsco-bot-preflight.ts
import { ArgumentError, CommandExecutionError as CommandExecutionError3 } from "@jackwener/opencli/errors";
import { z as z4 } from "zod";
var MAX_CONFIG_BYTES = 16 * 1024;
var MAX_KEY_BYTES = 8 * 1024;
var MAX_RESPONSE_BYTES = 128 * 1024;
var configSchema = z4.object({
  version: z4.literal(1),
  transport: z4.literal("catsco-bot-preflight-v1"),
  httpBaseUrl: z4.string().min(1),
  expectedBotUid: z4.string().regex(/^[1-9]\d*$/),
  apiKeyFile: z4.string().min(1)
}).strict();

// src/lib/exclusive-lock.ts
import { randomUUID } from "node:crypto";
import { chmod, mkdir, open as open2, readFile, stat, unlink } from "node:fs/promises";
import { dirname } from "node:path";
var DEFAULT_STALE_MS = 15 * 6e4;
function staleMs() {
  const value = Number(process.env.LOOPCTL_LOCK_STALE_MS ?? DEFAULT_STALE_MS);
  if (!Number.isFinite(value) || value < 1e3) throw new Error("LOOPCTL_LOCK_STALE_MS must be at least 1000 milliseconds");
  return value;
}
function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}
async function canReclaim(path) {
  const timeout = staleMs();
  const metadata = await stat(path);
  let record = {};
  try {
    record = JSON.parse(await readFile(path, "utf8"));
  } catch {
  }
  const created = Date.parse(typeof record.createdAt === "string" ? record.createdAt : metadata.mtime.toISOString());
  const pid = Number(record.pid);
  if (Number.isSafeInteger(pid) && pid > 0) return !processIsAlive(pid);
  const age = Number.isFinite(created) ? Date.now() - created : Number.POSITIVE_INFINITY;
  return age >= timeout;
}
async function acquireExclusiveLock(path, label) {
  await mkdir(dirname(path), { recursive: true, mode: 448 });
  const token = randomUUID();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const handle = await open2(path, "wx", 384);
      const record = { schema: "loopctl-exclusive-lock-v1", token, pid: process.pid, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
      try {
        await handle.writeFile(`${JSON.stringify(record)}
`, "utf8");
        await handle.sync();
        await chmod(path, 384);
      } catch (error) {
        await handle.close();
        await unlink(path).catch(() => void 0);
        throw error;
      }
      await handle.close();
      return {
        release: async () => {
          try {
            const current = JSON.parse(await readFile(path, "utf8"));
            if (current.token === token) await unlink(path);
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
        }
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (!await canReclaim(path)) throw new Error(`${label} is already active`);
      await unlink(path).catch(() => void 0);
    }
  }
  throw new Error(`${label} could not acquire a recovered lock`);
}

// src/lib/workspace.ts
import { createHash, randomUUID as randomUUID2 } from "node:crypto";
import { chmod as chmod2, lstat as lstat2, mkdir as mkdir2, readFile as readFile2, realpath as realpath2, rename, writeFile as writeFile2 } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname as dirname2, isAbsolute as isAbsolute2, join, normalize, relative as relative2, resolve as resolve2 } from "node:path";
import { spawn } from "node:child_process";
import { CommandExecutionError as CommandExecutionError4 } from "@jackwener/opencli/errors";
import { z as z5 } from "zod";
var id3 = z5.string().min(1);
var packetSchema = z5.object({
  kind: z5.literal("execute_attempt"),
  loopId: id3,
  githubRepo: id3,
  workBundle: z5.object({ instructions: id3 }).passthrough()
}).passthrough();
var MAX_OUTPUT3 = 128 * 1024;
var digest = (value) => createHash("sha256").update(canonicalJson(value)).digest("hex");
function workspaceRegistryDirectory() {
  return resolve2(process.env.LOOPCTL_WORKSPACE_REGISTRY_DIR?.trim() || join(homedir(), ".local", "state", "loopctl", "workspaces"));
}
async function git(gitDir, args) {
  return await new Promise((resolveResult, reject) => {
    const child = spawn("git", ["-C", gitDir, ...args], { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", killed = false;
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (Buffer.byteLength(stdout) > MAX_OUTPUT3) {
        killed = true;
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      if (Buffer.byteLength(stderr) > MAX_OUTPUT3) {
        killed = true;
        child.kill("SIGKILL");
      }
    });
    child.on("error", (error) => reject(new CommandExecutionError4(`git workspace preparation unavailable: ${error.message}`)));
    child.on("close", (code) => {
      if (killed) return reject(new CommandExecutionError4("git workspace preparation produced too much output"));
      if (code !== 0) return reject(new CommandExecutionError4(`git workspace preparation failed: ${stderr.trim().slice(0, 512) || `exit ${code ?? 1}`}`));
      resolveResult(stdout.trim());
    });
  });
}
function contractFromInstructions(instructions) {
  const marker = "LOOP_WORKTREE_CONTRACT_V1=";
  const lines = instructions.split("\n").filter((line) => line.startsWith(marker));
  if (lines.length !== 1) throw new CommandExecutionError4("execute packet requires exactly one LOOP_WORKTREE_CONTRACT_V1 line");
  try {
    return worktreeContractSchema.parse(JSON.parse(lines[0].slice(marker.length)));
  } catch {
    throw new CommandExecutionError4("execute packet carries an invalid worktree contract");
  }
}
function normalizedAbsolute(path, label) {
  if (!isAbsolute2(path) || normalize(path) !== path) throw new CommandExecutionError4(`${label} must be normalized and absolute`);
  return resolve2(path);
}
function registeredWorktree(list, path, branch) {
  const records = list.split("\n\n").map((record) => Object.fromEntries(record.split("\n").map((line) => {
    const index = line.indexOf(" ");
    return index < 0 ? [line, ""] : [line.slice(0, index), line.slice(index + 1)];
  })));
  return records.some((record) => record.worktree === path && record.branch === `refs/heads/${branch}`);
}
async function claimLease(value) {
  const directory = workspaceRegistryDirectory();
  await mkdir2(directory, { recursive: true, mode: 448 });
  await chmod2(directory, 448);
  const key = digest({ workspaceLease: value.workspaceLease });
  const path = join(directory, `${key}.json`);
  const lock = await acquireExclusiveLock(`${path}.lock`, `workspace lease ${String(value.workspaceLease)}`);
  try {
    const expectedDigest = digest(value);
    try {
      const current = JSON.parse(await readFile2(path, "utf8"));
      if (current.digest !== expectedDigest) throw new CommandExecutionError4("workspace lease is already bound to a different contract");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const temporary = `${path}.${process.pid}.${randomUUID2()}.tmp`;
      await writeFile2(temporary, `${JSON.stringify({ schema: "loopctl-workspace-lease-v1", digest: expectedDigest, contract: value }, null, 2)}
`, { encoding: "utf8", mode: 384 });
      await chmod2(temporary, 384);
      await rename(temporary, path);
    }
  } catch (error) {
    await lock.release();
    throw error;
  }
  return { release: async () => lock.release() };
}
async function prepareWorkspaceFromPacket(raw) {
  let packet;
  try {
    packet = packetSchema.parse(raw);
  } catch {
    throw new CommandExecutionError4("workspace-prepare requires an execute_attempt packet");
  }
  const contract = contractFromInstructions(packet.workBundle.instructions);
  if (!contract.gitDir) throw new CommandExecutionError4("worktree contract must include gitDir for workspace-prepare");
  const worktreePath = normalizedAbsolute(contract.worktreePath, "worktreePath");
  const gitDir = normalizedAbsolute(contract.gitDir, "gitDir");
  if (!contract.branchName.startsWith(`loop/${packet.loopId}/`)) throw new CommandExecutionError4("worktree branch must be scoped to the packet loopId");
  if (worktreePath === gitDir || relative2(gitDir, worktreePath) === "") throw new CommandExecutionError4("worktreePath must differ from gitDir");
  const baseRevision = await git(gitDir, ["rev-parse", `${contract.baseRevision}^{commit}`]);
  const contractDigest = digest(contract);
  const lease = await claimLease({ worktreePath, gitDir, branchName: contract.branchName, baseRevision, workspaceLease: contract.workspaceLease, contractDigest });
  let state;
  try {
    try {
      const stat2 = await lstat2(worktreePath);
      if (!stat2.isDirectory() || stat2.isSymbolicLink()) throw new CommandExecutionError4("existing worktreePath is not a regular directory");
      const list = await git(gitDir, ["worktree", "list", "--porcelain"]);
      const actualWorktreePath = await realpath2(worktreePath);
      if (!registeredWorktree(list, actualWorktreePath, contract.branchName)) {
        throw new CommandExecutionError4("existing worktreePath is not registered to the required branch");
      }
      const head = await git(worktreePath, ["rev-parse", "HEAD"]);
      if (head !== baseRevision) throw new CommandExecutionError4("existing worktree HEAD does not match the contract base revision");
      state = "verified";
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await mkdir2(dirname2(worktreePath), { recursive: true, mode: 448 });
      await git(gitDir, ["worktree", "add", "-b", contract.branchName, worktreePath, baseRevision]);
      state = "created";
    }
    const receipt = {
      schema: "loopctl-workspace-receipt-v1",
      state,
      worktreePath,
      gitDir,
      branchName: contract.branchName,
      baseRevision,
      workspaceLease: contract.workspaceLease,
      contractDigest
    };
    return { ...receipt, receiptDigest: digest(receipt) };
  } catch (error) {
    if (state === "created") {
      await git(gitDir, ["worktree", "remove", "--force", worktreePath]).catch(() => void 0);
    }
    throw error;
  } finally {
    await lease.release();
  }
}

// src/lib/controller-provenance.ts
import { ArgumentError as ArgumentError2 } from "@jackwener/opencli/errors";
import { z as z6 } from "zod";
var MAX_TRUSTED_KEYS_BYTES = 64 * 1024;
var trustedControllerKeysSchema = z6.object({
  version: z6.literal(1),
  keys: z6.array(z6.object({ ownerUid: z6.string().min(1), controllerKeyId: z6.string().min(1), publicKey: z6.string().min(1) }).strict())
}).strict();

// src/lib/commands.ts
async function workspacePrepare(kwargs) {
  let packet;
  try {
    packet = JSON.parse(await readConfinedFile(String(kwargs["packet-file"])));
  } catch (error) {
    throw new ArgumentError3(error instanceof Error ? error.message : "invalid execute packet file");
  }
  return prepareWorkspaceFromPacket(packet);
}

// loop-workspace-prepare.ts
cli({
  site: "loop",
  name: "workspace-prepare",
  description: "Worker-only: create and verify the exact fenced Git worktree from an execute packet",
  access: "write",
  browser: false,
  strategy: Strategy.LOCAL,
  args: [{ name: "packet-file", help: "Relative execute_attempt packet JSON file", required: true }],
  columns: ["state", "worktreePath", "gitDir", "branchName", "baseRevision", "workspaceLease", "receiptDigest"],
  defaultFormat: "json",
  func: workspacePrepare
});
