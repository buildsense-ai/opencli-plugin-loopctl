// loop-next.ts
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
var DEFAULT_STALE_MS = 15 * 6e4;

// src/lib/workspace.ts
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

// src/lib/controller-provenance.ts
import { ArgumentError as ArgumentError2 } from "@jackwener/opencli/errors";
import { z as z6 } from "zod";
var MAX_TRUSTED_KEYS_BYTES = 64 * 1024;
var trustedControllerKeysSchema = z6.object({
  version: z6.literal(1),
  keys: z6.array(z6.object({ ownerUid: z6.string().min(1), controllerKeyId: z6.string().min(1), publicKey: z6.string().min(1) }).strict())
}).strict();

// src/lib/commands.ts
var parseResponse = (schema, value, label) => {
  try {
    return schema.parse(value);
  } catch {
    throw new CommandExecutionError5(`loopctl returned malformed ${label} JSON`);
  }
};
var assertAcceptedReceipt = (value) => {
  const receipt = parseResponse(receiptSchema, value, "receipt");
  if (receipt.status === "rejected") throw new ArgumentError3(`loopctl rejected event: ${receipt.rejectionCode ?? "unknown"}`);
  return receipt;
};
async function ingest(event) {
  return assertAcceptedReceipt(unwrap(await runLoopctl(["ingest", "--file", "-"], `${JSON.stringify(event)}
`)));
}
async function tick() {
  return parseResponse(tickSchema, unwrap(await runLoopctl(["tick"])), "tick");
}
var readPlan = async (file) => {
  try {
    return parsePlan(await readConfinedFile(file));
  } catch (error) {
    throw new ArgumentError3(error instanceof Error ? error.message : "invalid plan file");
  }
};
async function next(kwargs) {
  const actionId = String(kwargs["plan-next-action-id"] ?? "");
  if (!actionId) throw new ArgumentError3("next requires --plan-next-action-id");
  const packet = parseResponse(actionPacketSchema, unwrap(await runLoopctl(["packet", "--action-id", actionId])), "packet");
  if (packet.kind !== "plan_next" || !["accepted", "closed"].includes(packet.completedWorkItem.state) || !["ready", "satisfied"].includes(packet.action.state)) throw new ArgumentError3("plan_next action is stale or not current");
  const events = await readPlan(String(kwargs["plan-file"]));
  const registration = events[0];
  if (registration.payload.loopId !== packet.loopId) throw new ArgumentError3("next plan loopId does not match plan_next packet");
  if (registration.payload.workItemId === packet.completedWorkItem.workItemId) throw new ArgumentError3("next plan must use a new Work Item ID");
  const receipts = [];
  receipts.push(await ingest(events[0]));
  receipts.push(await ingest(events[1]));
  return { planNextPacket: packet, receipts, tick: await tick() };
}

// loop-next.ts
cli({ site: "loop", name: "next", description: "Review-only: start the next Work Item in a loop", access: "write", browser: false, strategy: Strategy.LOCAL, args: [{ name: "plan-next-action-id", help: "Current plan_next action id", required: true }, { name: "plan-file", help: "Plan JSON file", required: true }], columns: ["planNextPacket", "receipts", "tick"], defaultFormat: "json", func: next });
