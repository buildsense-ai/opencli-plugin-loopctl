// loop-agent-task-start.ts
import { cli, Strategy } from "@jackwener/opencli/registry";

// src/lib/commands.ts
import { ArgumentError, CommandExecutionError as CommandExecutionError4 } from "@jackwener/opencli/errors";

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

// src/lib/events.ts
import { posix } from "node:path";
import { z as z2 } from "zod";
var id2 = z2.string().min(1);
var hash2 = z2.string().min(8);
var base = { eventId: id2, idempotencyKey: id2, source: id2, entityRef: id2 };
var contracts = { taskContractHash: hash2, referenceSnapshotHash: hash2, writeScopeHash: hash2, acceptanceContractHash: hash2 };
var deliverable = z2.object({ kind: z2.literal("github_pr"), repository: id2, prNumber: z2.number().int().positive(), headSha: id2, baseSha: id2, digest: hash2 }).strict();
var registered = z2.object({ ...base, type: z2.literal("work_item_registered"), payload: z2.object({ workItemId: id2, loopId: id2, profileId: id2, terminalState: z2.enum(["accepted", "closed"]), ...contracts, writeScope: z2.array(id2), githubRepo: id2, catscoProjectId: id2, workerTopicId: id2, evidenceTopicId: id2.optional(), stewardTopicId: id2, stewardPrincipal: id2.optional(), coordinatorSessionId: id2.optional(), coordinatorSessionTopicId: id2.optional() }).strict() }).strict();
var worktreeContract = z2.object({ repository: id2, baseRevision: id2, branchName: id2, worktreePath: id2, gitDir: id2.optional(), cleanupPolicy: z2.enum(["retain-until-review", "retain-until-integration", "remove-after-candidate"]), workspaceLease: id2 }).strict();
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
function parseAgentTaskStart(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("agent-task start file is not valid JSON");
  }
  if (!Array.isArray(value) || value.length !== 2) throw new Error("agent-task start file must contain exactly one registration/bundle pair");
  const registration = registered.parse(value[0]);
  const proposed = bundle.parse(value[1]);
  const r = registration.payload, b = proposed.payload;
  if (r.workItemId !== b.workItemId || b.expectedRevision !== 1) throw new Error("agent-task start pair identity or revision mismatch");
  if (r.coordinatorSessionId !== void 0 || r.coordinatorSessionTopicId !== void 0) throw new Error("agent-task start provisions a new Project coordinator; do not supply coordinator session or topic fields");
  if (b.attemptRoute !== void 0) throw new Error("agent-task start provisions its own Project routes; do not supply bundle attemptRoute");
  for (const key of ["taskContractHash", "referenceSnapshotHash", "writeScopeHash", "acceptanceContractHash"]) if (r[key] !== b[key]) throw new Error(`plan contract mismatch: ${key}`);
  const worker = /^agent-task:([1-9]\d*)$/.exec(r.workerTopicId);
  const evidence = /^evidence-topic:([1-9]\d*):([1-9]\d*)$/.exec(r.evidenceTopicId ?? "");
  const review2 = /^review-topic:([1-9]\d*)$/.exec(r.stewardTopicId);
  if (!worker || !evidence || !review2) throw new Error("agent-task start requires workerTopicId agent-task:<WorkerUid>, evidenceTopicId evidence-topic:<WorkerUid>:<ReviewUid>, and stewardTopicId review-topic:<ReviewUid>");
  if (evidence[1] !== worker[1] || review2[1] !== evidence[2]) throw new Error("agent-task start placeholders must bind the same Worker and Review principals");
  if (b.runtimePrincipal !== `catsco-user:${worker[1]}`) throw new Error("agent-task start runtime principal does not match Worker UID");
  if (r.stewardPrincipal !== `catsco-user:${review2[1]}`) throw new Error("agent-task start steward principal does not match Review UID");
  if (r.catscoProjectId !== "project:new") throw new Error("agent-task start catscoProjectId must be project:new; the command creates a fresh Project");
  if ((/* @__PURE__ */ new Set([r.workerTopicId, r.evidenceTopicId, r.stewardTopicId])).size !== 3) throw new Error("agent-task start topics must be distinct");
  const marker = "LOOP_WORKTREE_CONTRACT_V1=";
  const worktreeLines = b.workBundle.instructions.split("\n").filter((line) => line.startsWith(marker));
  if (worktreeLines.length !== 1) throw new Error("agent-task start requires exactly one LOOP_WORKTREE_CONTRACT_V1 line");
  let worktree;
  try {
    worktree = worktreeContract.parse(JSON.parse(worktreeLines[0].slice(marker.length)));
  } catch {
    throw new Error("agent-task start worktree contract is invalid");
  }
  if (!worktree.gitDir) throw new Error("agent-task start worktree contract requires gitDir for workspace-prepare");
  if (!posix.isAbsolute(worktree.worktreePath) || posix.normalize(worktree.worktreePath) !== worktree.worktreePath || !posix.isAbsolute(worktree.gitDir) || posix.normalize(worktree.gitDir) !== worktree.gitDir) {
    throw new Error("agent-task start worktreePath and gitDir must be normalized absolute paths");
  }
  return { registration, bundle: proposed, workerAgentUid: worker[1], reviewAgentUid: review2[1] };
}
function parsePlan(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("plan file is not valid JSON");
  }
  if (!Array.isArray(value) || value.length !== 2) throw new Error("plan file must be an array of exactly two events");
  const parsed = value.map((item) => planEvent.parse(item));
  const registration = parsed[0], proposed = parsed[1];
  if (registration.type !== "work_item_registered" || proposed.type !== "work_bundle_proposed") throw new Error("plan must contain work_item_registered followed by work_bundle_proposed");
  const r = registration.payload, b = proposed.payload;
  if (r.workItemId !== b.workItemId) throw new Error("plan Work Item IDs must match");
  if (b.expectedRevision !== 1) throw new Error("new plan bundle expectedRevision must be 1");
  for (const key of ["taskContractHash", "referenceSnapshotHash", "writeScopeHash", "acceptanceContractHash"]) if (r[key] !== b[key]) throw new Error(`plan contract mismatch: ${key}`);
  if (!r.workerTopicId || !r.stewardTopicId || r.workerTopicId === r.stewardTopicId) throw new Error("plan requires distinct worker and steward topics");
  if (r.evidenceTopicId !== void 0) {
    if (!/^grp_[1-9]\d*$/.test(r.evidenceTopicId)) throw new Error("evidenceTopicId must be a CatsCo group topic");
    if ((/* @__PURE__ */ new Set([r.workerTopicId, r.evidenceTopicId, r.stewardTopicId])).size !== 3) throw new Error("plan requires distinct worker, evidence, and steward topics");
  }
  const numericCatscoPrincipal = /^catsco-user:[1-9]\d*$/;
  if (r.stewardTopicId.startsWith("grp_") && (!r.stewardPrincipal || !numericCatscoPrincipal.test(r.stewardPrincipal))) throw new Error("group Steward topic requires a numeric CatsCo principal");
  if (r.stewardPrincipal !== void 0 && !r.stewardPrincipal.startsWith("catsco-user:")) throw new Error("plan stewardPrincipal must be a CatsCo principal");
  if ((b.proofMode ?? "ed25519") === "catsco-message" && !b.runtimePrincipal.startsWith("catsco-user:")) throw new Error("CatsCo-message bundle requires a CatsCo runtime principal");
  if (b.proofMode === "ed25519" && (!b.proofKeyId || !b.proofPublicKey)) throw new Error("Ed25519 bundle requires proof key fields");
  return parsed;
}

// src/lib/loopctl.ts
import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { realpath, lstat, open } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { z as z3 } from "zod";
import { CommandExecutionError } from "@jackwener/opencli/errors";
var MAX_OUTPUT = 2 * 1024 * 1024;
var MAX_INPUT = 512 * 1024;
var timeoutMs = 3e4;
var jsonValue = z3.unknown();
function binary() {
  return process.env.LOOPCTL_BINARY?.trim() || "loopctl";
}
async function runLoopctl(args, input) {
  if (args.length > 8 || args.some((arg) => arg.length > 4096 || arg.includes("\0"))) {
    throw new CommandExecutionError("invalid loopctl arguments");
  }
  if (input && Buffer.byteLength(input) > MAX_INPUT) throw new CommandExecutionError("loopctl input is too large");
  return await new Promise((resolveResult, reject) => {
    const child = spawn(binary(), args, { shell: false, env: { ...process.env }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "", killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (Buffer.byteLength(stdout) > MAX_OUTPUT) {
        killed = true;
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk).slice(0, 4096);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new CommandExecutionError(`loopctl unavailable: ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (killed) return reject(new CommandExecutionError("loopctl timed out or produced too much output"));
      if (code !== 0) return reject(new CommandExecutionError(`loopctl failed (exit ${code ?? 1})`));
      try {
        resolveResult(JSON.parse(stdout));
      } catch {
        reject(new CommandExecutionError("loopctl returned invalid JSON"));
      }
    });
    child.stdin.end(input ?? "");
  });
}
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
var unwrap = (value) => {
  if (value && typeof value === "object" && "data" in value) return value.data;
  return value;
};

// src/lib/catsco.ts
import { spawn as spawn2 } from "node:child_process";
import { CommandExecutionError as CommandExecutionError2 } from "@jackwener/opencli/errors";
var MAX_OUTPUT2 = 128 * 1024;
var TIMEOUT_MS = 3e4;
function unwrap2(value) {
  if (value && typeof value === "object" && "data" in value) return value.data;
  return value;
}
function asRecord(value, label) {
  const row2 = unwrap2(value);
  if (!row2 || typeof row2 !== "object" || Array.isArray(row2)) throw new CommandExecutionError2(`CatsCo ${label} returned a non-object`);
  return row2;
}
async function runOpenCli(args) {
  return await new Promise((resolve3, reject) => {
    const child = spawn2(process.env.OPENCLI_BINARY?.trim() || "opencli", args, { shell: false, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
    }, TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (Buffer.byteLength(stdout) > MAX_OUTPUT2) {
        killed = true;
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk).slice(0, 4096);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new CommandExecutionError2(`CatsCo provisioning unavailable: ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (killed) return reject(new CommandExecutionError2("CatsCo provisioning timed out or produced too much output"));
      if (code !== 0) return reject(new CommandExecutionError2(`CatsCo provisioning failed: ${stderr.trim().slice(0, 512) || `exit ${code ?? 1}`}`));
      try {
        resolve3(JSON.parse(stdout));
      } catch {
        reject(new CommandExecutionError2("CatsCo provisioning returned invalid JSON"));
      }
    });
  });
}
async function currentCatscoUid() {
  const row2 = asRecord(await runOpenCli(["catsco", "me", "--format", "json"]), "identity");
  const uid = String(row2.uid ?? "");
  if (!/^[1-9]\d*$/.test(uid)) throw new CommandExecutionError2("CatsCo identity response has no numeric uid");
  return uid;
}
function csv(value) {
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}
async function groupInfo(groupId) {
  const row2 = asRecord(await runOpenCli(["catsco", "group-info", groupId, "--format", "json"]), "group topology");
  const returnedGroupId = String(row2.groupId ?? "");
  const topic = String(row2.topic ?? "");
  const kind = String(row2.kind ?? "");
  const agentIds = csv(row2.agentIds).sort();
  const memberIds = csv(row2.memberIds).sort();
  if (returnedGroupId !== groupId || topic !== `grp_${groupId}` || kind !== "standard" && kind !== "agent_task") {
    throw new CommandExecutionError2("CatsCo group topology response did not bind the requested group");
  }
  return { groupId: returnedGroupId, topic, kind, agentIds: agentIds.join(","), memberIds: memberIds.join(",") };
}
async function createStandardTopic(name, agentUids) {
  const ownerUid = await currentCatscoUid();
  const expected = [...new Set(agentUids)].sort();
  if (!name || name.length > 180 || expected.length === 0 || expected.some((uid) => !/^[1-9]\d*$/.test(uid))) {
    throw new CommandExecutionError2("standard evidence/review topic request is invalid");
  }
  const created = asRecord(await runOpenCli(["catsco", "group-create", name, expected.join(","), "--kind", "standard", "--format", "json"]), "standard topic provisioning");
  const groupId = String(created.groupId ?? created.group_id ?? "");
  if (!/^[1-9]\d*$/.test(groupId)) throw new CommandExecutionError2("CatsCo standard topic provisioning returned an invalid group id");
  const topology = await groupInfo(groupId);
  if (topology.kind !== "standard" || topology.agentIds.split(",").filter(Boolean).sort().join(",") !== expected.join(",") || !topology.memberIds.split(",").filter(Boolean).includes(ownerUid)) {
    throw new CommandExecutionError2("CatsCo standard topic topology failed verification");
  }
  return { ...topology, kind: "standard" };
}
async function createAgentTaskTopic(name, workerAgentUid) {
  const ownerUid = await currentCatscoUid();
  if (!/^[1-9]\d*$/.test(workerAgentUid)) throw new CommandExecutionError2("agent-task Worker UID must be numeric");
  if (!name || name.length > 180) throw new CommandExecutionError2("agent-task name is invalid");
  const value = await runOpenCli(["catsco", "group-create", name, workerAgentUid, "--kind", "agent_task", "--format", "json"]);
  const row2 = unwrap2(value);
  if (!row2 || typeof row2 !== "object" || Array.isArray(row2)) throw new CommandExecutionError2("CatsCo agent-task provisioning returned a non-object");
  const record = row2;
  const groupId = String(record.groupId ?? record.group_id ?? "");
  const topic = String(record.topic ?? "");
  const kind = String(record.kind ?? "");
  const agentIds = String(record.agentIds ?? record.agent_ids ?? "");
  const actualIds = agentIds.split(",").map((value2) => value2.trim()).filter(Boolean);
  if (!/^[1-9]\d*$/.test(groupId) || !/^grp_[1-9]\d*$/.test(topic) || kind !== "agent_task" || actualIds.length !== 1 || actualIds[0] !== workerAgentUid) {
    throw new CommandExecutionError2("CatsCo agent-task provisioning response failed topology verification");
  }
  const topology = await groupInfo(groupId);
  if (topology.kind !== "agent_task" || topology.agentIds !== workerAgentUid || !topology.memberIds.split(",").filter(Boolean).includes(ownerUid)) {
    throw new CommandExecutionError2("CatsCo agent-task topology failed verification");
  }
  return { groupId, topic, kind: "agent_task", agentIds };
}
async function createAttemptProject(loopId, attemptId) {
  const name = `Loop ${loopId} ${attemptId}`;
  if (!name || name.length > 180) throw new CommandExecutionError2("CatsCo Project name is invalid");
  const created = asRecord(await runOpenCli(["catsco", "project-create", name, "--format", "json"]), "Project provisioning");
  const projectId = String(created.id ?? created.projectId ?? created.project_id ?? "");
  if (!/^[1-9]\d*$/.test(projectId)) throw new CommandExecutionError2("CatsCo Project provisioning returned an invalid Project id");
  return projectId;
}
async function attachTopicToProject(projectId, topic) {
  if (!/^[1-9]\d*$/.test(projectId)) throw new CommandExecutionError2("CatsCo Project id must be numeric");
  await runOpenCli(["catsco", "project-assign-topic", projectId, topic, "--format", "json"]);
  const sessions = unwrap2(await runOpenCli(["catsco", "project-sessions", projectId, "--format", "json"]));
  if (!Array.isArray(sessions) || !sessions.some((row2) => row2 && typeof row2 === "object" && String(row2.topicId ?? "") === topic)) {
    throw new CommandExecutionError2("CatsCo Project assignment readback did not contain the Attempt topic");
  }
}

// src/lib/provisioning-journal.ts
import { createHash } from "node:crypto";
import { chmod as chmod2, mkdir as mkdir2, readFile as readFile2, rename, writeFile as writeFile2 } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve as resolve2 } from "node:path";

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

// src/lib/provisioning-journal.ts
var digest = (value) => createHash("sha256").update(canonicalJson(value)).digest("hex");
var now = () => (/* @__PURE__ */ new Date()).toISOString();
function numericIds(value) {
  if (typeof value !== "string") return void 0;
  const ids = value.split(",").map((id4) => id4.trim());
  if (ids.length === 0 || ids.some((id4) => !/^[1-9]\d*$/.test(id4)) || new Set(ids).size !== ids.length) return void 0;
  return ids.sort();
}
function isProvisionedTopicRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const topic = value;
  const groupId = topic.groupId;
  const topicId = topic.topic;
  const kind = topic.kind;
  return typeof groupId === "string" && typeof topicId === "string" && /^[1-9]\d*$/.test(groupId) && topicId === `grp_${groupId}` && (kind === "agent_task" || kind === "standard") && numericIds(topic.agentIds) !== void 0 && (topic.memberIds === void 0 || numericIds(topic.memberIds) !== void 0);
}
function hasExactAgents(topic, expected) {
  const actual = numericIds(topic.agentIds);
  return actual !== void 0 && actual.length === expected.length && actual.every((id4, index) => id4 === expected[index]);
}
function includesRoleMembers(topic, expected) {
  const members = topic.memberIds === void 0 ? void 0 : numericIds(topic.memberIds);
  return members === void 0 || expected.every((id4) => members.includes(id4));
}
function retryRolePrincipals(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return void 0;
  const value = plan;
  const packet = value.packet;
  const retry = value.retry;
  if (!packet || typeof packet !== "object" || Array.isArray(packet) || !retry || typeof retry !== "object" || Array.isArray(retry)) return void 0;
  const packetRecord = packet;
  const retryRecord = retry;
  const payload = retryRecord.payload;
  if (packetRecord.kind !== "recover_attempt" || retryRecord.type !== "work_bundle_proposed" || !payload || typeof payload !== "object" || Array.isArray(payload)) return void 0;
  const worker = /^catsco-user:([1-9]\d*)$/.exec(String(payload.runtimePrincipal ?? ""))?.[1];
  const reviewer = /^catsco-user:([1-9]\d*)$/.exec(String(packetRecord.stewardPrincipal ?? ""))?.[1];
  return worker && reviewer ? { worker, reviewer } : void 0;
}
function migrateLegacyRetryJournal(value, kind, id4, planDigest, plan) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("provisioning journal identity does not match the requested plan");
  const legacy = value;
  if (legacy.schema !== "loopctl-provision-journal-v1") throw new Error("provisioning journal identity does not match the requested plan");
  if (kind !== "agent-task-retry") throw new Error("v1 agent-task-start journal cannot be resumed as a Project-owned coordinator invocation; create a new plan");
  const principals = retryRolePrincipals(plan);
  const workerTopic = legacy.workerTopic;
  const evidenceTopic = legacy.evidenceTopic;
  const reviewTopic = legacy.reviewTopic;
  const workerAgents = principals ? [principals.worker] : [];
  const evidenceAgents = principals ? [principals.worker, principals.reviewer].sort() : [];
  const reviewAgents = principals ? [principals.reviewer] : [];
  const topicIds = [workerTopic?.topic, evidenceTopic?.topic, reviewTopic?.topic];
  if (legacy.kind !== kind || legacy.planDigest !== planDigest || legacy.id !== id4 || !Array.isArray(legacy.manualCleanupTopicIds) || !legacy.manualCleanupTopicIds.every((topic) => typeof topic === "string") || typeof legacy.projectId !== "string" || !/^[1-9]\d*$/.test(legacy.projectId) || !principals || !isProvisionedTopicRecord(workerTopic) || !isProvisionedTopicRecord(evidenceTopic) || !isProvisionedTopicRecord(reviewTopic) || workerTopic.kind !== "agent_task" || evidenceTopic.kind !== "standard" || reviewTopic.kind !== "standard" || new Set(topicIds).size !== topicIds.length || !hasExactAgents(workerTopic, workerAgents) || !hasExactAgents(evidenceTopic, evidenceAgents) || !hasExactAgents(reviewTopic, reviewAgents) || !includesRoleMembers(workerTopic, workerAgents) || !includesRoleMembers(evidenceTopic, evidenceAgents) || !includesRoleMembers(reviewTopic, reviewAgents)) {
    throw new Error("v1 retry journal topology is incompatible with safe migration");
  }
  return { ...legacy, schema: "loopctl-provision-journal-v2" };
}
function directory() {
  return resolve2(process.env.LOOPCTL_PROVISION_JOURNAL_DIR?.trim() || join(homedir(), ".local", "state", "loopctl", "provisioning"));
}
async function persist(path, value) {
  const dir = directory();
  await mkdir2(dir, { recursive: true, mode: 448 });
  await chmod2(dir, 448);
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile2(temporary, `${JSON.stringify(value, null, 2)}
`, { encoding: "utf8", mode: 384 });
  await chmod2(temporary, 384);
  await rename(temporary, path);
}
async function openProvisionJournal(kind, plan) {
  const planDigest = digest(plan);
  const id4 = `${kind}:${planDigest}`;
  const path = join(directory(), `${kind}-${planDigest}.json`);
  const dir = directory();
  await mkdir2(dir, { recursive: true, mode: 448 });
  await chmod2(dir, 448);
  const lock = await acquireExclusiveLock(`${path}.lock`, `provisioning journal ${id4}`);
  let journal;
  try {
    try {
      const existing = JSON.parse(await readFile2(path, "utf8"));
      const isLegacy = !!existing && typeof existing === "object" && !Array.isArray(existing) && existing.schema === "loopctl-provision-journal-v1";
      journal = isLegacy ? migrateLegacyRetryJournal(existing, kind, id4, planDigest, plan) : existing;
      if (journal.schema !== "loopctl-provision-journal-v2" || journal.kind !== kind || journal.planDigest !== planDigest || journal.id !== id4) {
        throw new Error("provisioning journal identity does not match the requested plan");
      }
      if (journal.phase !== "validated" && journal.phase !== "failed") {
        throw new Error(`provisioning journal requires explicit recovery before resume: ${journal.phase}`);
      }
      if (isLegacy) await persist(path, journal);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const timestamp = now();
      journal = {
        schema: "loopctl-provision-journal-v2",
        id: id4,
        kind,
        planDigest,
        phase: "validated",
        createdAt: timestamp,
        updatedAt: timestamp,
        manualCleanupTopicIds: []
      };
      await persist(path, journal);
    }
  } catch (error) {
    await lock.release();
    throw error;
  }
  const release = async () => lock.release();
  const save = async (patch) => {
    journal = { ...journal, ...patch, updatedAt: now() };
    await persist(path, journal);
    return journal;
  };
  return { journal: () => journal, path, save, release };
}

// src/lib/workspace.ts
import { CommandExecutionError as CommandExecutionError3 } from "@jackwener/opencli/errors";
import { z as z4 } from "zod";
var id3 = z4.string().min(1);
var packetSchema = z4.object({
  kind: z4.literal("execute_attempt"),
  loopId: id3,
  githubRepo: id3,
  workBundle: z4.object({ instructions: id3 }).passthrough()
}).passthrough();
var MAX_OUTPUT3 = 128 * 1024;

// src/lib/commands.ts
var parseResponse = (schema, value, label) => {
  try {
    return schema.parse(value);
  } catch {
    throw new CommandExecutionError4(`loopctl returned malformed ${label} JSON`);
  }
};
var assertAcceptedReceipt = (value) => {
  const receipt = parseResponse(receiptSchema, value, "receipt");
  if (receipt.status === "rejected") throw new ArgumentError(`loopctl rejected event: ${receipt.rejectionCode ?? "unknown"}`);
  return receipt;
};
async function ingest(event) {
  return assertAcceptedReceipt(unwrap(await runLoopctl(["ingest", "--file", "-"], `${JSON.stringify(event)}
`)));
}
async function tick() {
  return parseResponse(tickSchema, unwrap(await runLoopctl(["tick"])), "tick");
}
async function agentTaskStart(kwargs) {
  let parsed;
  let raw;
  try {
    raw = await readConfinedFile(String(kwargs["plan-file"]));
    parsed = parseAgentTaskStart(raw);
  } catch (error) {
    throw new ArgumentError(error instanceof Error ? error.message : "invalid agent-task start plan");
  }
  const journalStore = await openProvisionJournal("agent-task-start", JSON.parse(raw));
  const asRecord2 = (topic) => ({
    groupId: topic.groupId,
    topic: topic.topic,
    kind: topic.kind,
    agentIds: topic.agentIds,
    ...topic.memberIds ? { memberIds: topic.memberIds } : {}
  });
  try {
    let journal = journalStore.journal();
    const projectId = journal.projectId ?? await createAttemptProject(parsed.registration.payload.loopId, parsed.bundle.payload.attemptId);
    if (!journal.projectId) journal = await journalStore.save({ phase: "project_resolved", projectId });
    const coordinatorTopic = journal.coordinatorTopic ?? asRecord2(await createStandardTopic(
      `Loop ${parsed.registration.payload.loopId} ${parsed.bundle.payload.attemptId} coordinator`,
      [parsed.reviewAgentUid]
    ));
    if (!journal.coordinatorTopic) journal = await journalStore.save({
      phase: "topics_created",
      coordinatorTopic,
      manualCleanupTopicIds: [...journal.manualCleanupTopicIds, coordinatorTopic.topic]
    });
    const workerTopic = journal.workerTopic ?? asRecord2(await createAgentTaskTopic(
      `Loop ${parsed.registration.payload.loopId} ${parsed.bundle.payload.attemptId} execution`,
      parsed.workerAgentUid
    ));
    if (!journal.workerTopic) journal = await journalStore.save({
      phase: "topics_created",
      workerTopic,
      manualCleanupTopicIds: [...journal.manualCleanupTopicIds, workerTopic.topic]
    });
    const evidenceTopic = journal.evidenceTopic ?? asRecord2(await createStandardTopic(
      `Loop ${parsed.registration.payload.loopId} ${parsed.bundle.payload.attemptId} evidence`,
      [parsed.workerAgentUid, parsed.reviewAgentUid]
    ));
    if (!journal.evidenceTopic) journal = await journalStore.save({
      phase: "topics_created",
      evidenceTopic,
      manualCleanupTopicIds: [...journal.manualCleanupTopicIds, evidenceTopic.topic]
    });
    const reviewTopic = journal.reviewTopic ?? asRecord2(await createStandardTopic(
      `Loop ${parsed.registration.payload.loopId} ${parsed.bundle.payload.attemptId} review`,
      [parsed.reviewAgentUid]
    ));
    if (!journal.reviewTopic) journal = await journalStore.save({
      phase: "topics_created",
      reviewTopic,
      manualCleanupTopicIds: [...journal.manualCleanupTopicIds, reviewTopic.topic]
    });
    await attachTopicToProject(projectId, coordinatorTopic.topic);
    await attachTopicToProject(projectId, workerTopic.topic);
    await attachTopicToProject(projectId, evidenceTopic.topic);
    await attachTopicToProject(projectId, reviewTopic.topic);
    journal = await journalStore.save({ phase: "topics_attached", projectId, coordinatorTopic, workerTopic, evidenceTopic, reviewTopic });
    const coordinatorSessionId = `session:v2:catscompany:group:${coordinatorTopic.topic}:agent:${parsed.reviewAgentUid}`;
    const registrationEvent = { ...parsed.registration, payload: {
      ...parsed.registration.payload,
      catscoProjectId: projectId,
      workerTopicId: workerTopic.topic,
      evidenceTopicId: evidenceTopic.topic,
      stewardTopicId: reviewTopic.topic,
      stewardPrincipal: `catsco-user:${parsed.reviewAgentUid}`,
      coordinatorSessionId,
      coordinatorSessionTopicId: coordinatorTopic.topic
    } };
    const routedBundle = { ...parsed.bundle, payload: { ...parsed.bundle.payload, attemptRoute: {
      catscoProjectId: projectId,
      workerTopicId: workerTopic.topic,
      evidenceTopicId: evidenceTopic.topic,
      stewardTopicId: reviewTopic.topic,
      stewardPrincipal: `catsco-user:${parsed.reviewAgentUid}`,
      workerSessionId: `session:v2:catscompany:group:${workerTopic.topic}:agent:${parsed.workerAgentUid}`,
      coordinatorSessionId,
      coordinatorSessionTopicId: coordinatorTopic.topic
    } } };
    const events = [registrationEvent, routedBundle];
    parsePlan(JSON.stringify(events));
    const registrationReceipt = journal.registrationReceipt ?? await ingest(registrationEvent);
    if (!journal.registrationReceipt) journal = await journalStore.save({ phase: "registration_ingested", registrationReceipt });
    const bundleReceipt = journal.bundleReceipt ?? await ingest(routedBundle);
    if (!journal.bundleReceipt) journal = await journalStore.save({ phase: "bundle_ingested", bundleReceipt });
    const tickReceipt = journal.tick ?? await tick();
    journal = await journalStore.save({ phase: "completed", tick: tickReceipt });
    return { count: 1, projectId, provisionedTopics: { coordinatorTopic, workerTopic, evidenceTopic, reviewTopic }, receipts: [registrationReceipt, bundleReceipt], tick: tickReceipt, journalPath: journalStore.path };
  } catch (error) {
    const journal = journalStore.journal();
    await journalStore.save({
      phase: "failed",
      error: String(error instanceof Error ? error.message : error).slice(0, 1e3),
      manualCleanupTopicIds: journal.manualCleanupTopicIds
    });
    throw error;
  } finally {
    await journalStore.release();
  }
}

// loop-agent-task-start.ts
cli({
  site: "loop",
  name: "agent-task-start",
  description: "Review-only: create a fresh Project and provision coordinator, Worker execution, evidence, and Review Topics before dispatch",
  access: "write",
  browser: false,
  strategy: Strategy.LOCAL,
  args: [{ name: "plan-file", help: "Single-item plan with agent-task/evidence/review placeholders", required: true }],
  columns: ["count", "projectId", "provisionedTopics", "receipts", "tick", "journalPath"],
  defaultFormat: "json",
  func: agentTaskStart
});
