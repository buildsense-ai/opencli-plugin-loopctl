// loop-fanout.ts
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
var integrationInputs = z2.object({ workItemId: id2, candidateId: id2, repository: id2, prNumber: z2.number().int().positive(), headSha: id2, digest: hash2 }).strict();
function parseFanout(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("fanout file is not valid JSON");
  }
  if (!Array.isArray(value) || value.length < 4 || value.length % 2 !== 0) throw new Error("fanout file must contain at least two registration/bundle pairs");
  const parsed = value.map((item) => planEvent.parse(item));
  const loopIds = new Set(parsed.filter((e) => e.type === "work_item_registered").map((e) => e.payload.loopId));
  if (loopIds.size !== 1) throw new Error("fanout plans must share one loopId");
  const workItems = /* @__PURE__ */ new Set(), attempts = /* @__PURE__ */ new Set(), branches = /* @__PURE__ */ new Set(), paths = /* @__PURE__ */ new Set(), leases = /* @__PURE__ */ new Set(), workerTopics = /* @__PURE__ */ new Set(), eventIds = /* @__PURE__ */ new Set(), idempotencyKeys = /* @__PURE__ */ new Set();
  for (let i = 0; i < parsed.length; i += 2) {
    const r = parsed[i], b = parsed[i + 1];
    if (r.type !== "work_item_registered" || b.type !== "work_bundle_proposed") throw new Error("fanout must contain registration/bundle pairs");
    for (const event of [r, b]) {
      if (eventIds.has(event.eventId) || idempotencyKeys.has(event.idempotencyKey)) throw new Error("fanout event IDs and idempotency keys must be unique");
      eventIds.add(event.eventId);
      idempotencyKeys.add(event.idempotencyKey);
    }
    if (r.payload.workItemId !== b.payload.workItemId || b.payload.expectedRevision !== 1) throw new Error("fanout pair identity or revision mismatch");
    if (workItems.has(r.payload.workItemId) || attempts.has(b.payload.attemptId)) throw new Error("fanout IDs must be unique");
    const marker = "LOOP_WORKTREE_CONTRACT_V1=";
    const lines = b.payload.workBundle.instructions.split("\n").filter((value2) => value2.startsWith(marker));
    if (lines.length !== 1) throw new Error("fanout bundle requires exactly one LOOP_WORKTREE_CONTRACT_V1 line");
    let wt;
    try {
      wt = worktreeContract.parse(JSON.parse(lines[0].slice(marker.length)));
    } catch {
      throw new Error("fanout worktree contract is invalid");
    }
    if (!posix.isAbsolute(wt.worktreePath) || posix.normalize(wt.worktreePath) !== wt.worktreePath) throw new Error("fanout worktreePath must be normalized and absolute");
    const normalizedPath = wt.worktreePath;
    if (wt.repository !== r.payload.githubRepo) throw new Error("worktree repository must match githubRepo");
    if (!wt.branchName.startsWith(`loop/${r.payload.loopId}/`)) throw new Error("worktree branch must be scoped to loopId");
    if (branches.has(wt.branchName) || paths.has(normalizedPath) || leases.has(wt.workspaceLease) || workerTopics.has(r.payload.workerTopicId)) throw new Error("fanout worker topics, worktrees, and workspace leases must be unique");
    workItems.add(r.payload.workItemId);
    attempts.add(b.payload.attemptId);
    branches.add(wt.branchName);
    paths.add(normalizedPath);
    leases.add(wt.workspaceLease);
    workerTopics.add(r.payload.workerTopicId);
    parsePlan(JSON.stringify([r, b]));
  }
  return parsed;
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
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error("input file must remain a regular file");
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
import { CommandExecutionError as CommandExecutionError2 } from "@jackwener/opencli/errors";
var MAX_OUTPUT2 = 128 * 1024;

// src/lib/exclusive-lock.ts
var DEFAULT_STALE_MS = 15 * 6e4;

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
async function fanout(kwargs) {
  let events;
  try {
    events = parseFanout(await readConfinedFile(String(kwargs["plan-file"])));
  } catch (error) {
    throw new ArgumentError(error instanceof Error ? error.message : "invalid fanout file");
  }
  const receipts = [];
  for (const event of events) receipts.push(await ingest(event));
  return { count: events.length / 2, receipts, tick: await tick() };
}

// loop-fanout.ts
cli({ site: "loop", name: "fanout", description: "Review-only: register and dispatch multiple independent Work Item plans", access: "write", browser: false, strategy: Strategy.LOCAL, args: [{ name: "plan-file", help: "Fan-out JSON file containing registration/bundle pairs", required: true }], columns: ["count", "receipts", "tick"], defaultFormat: "json", func: fanout });
