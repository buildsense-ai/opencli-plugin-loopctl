// loop-preflight-ready.ts
import { cli, Strategy } from "@jackwener/opencli/registry";

// src/lib/commands.ts
import { createHash as createHash3 } from "node:crypto";
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
var canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : value;
function canonicalJson(value) {
  return JSON.stringify(canonical(value));
}
var integrationInputs = z2.object({ workItemId: id2, candidateId: id2, repository: id2, prNumber: z2.number().int().positive(), headSha: id2, digest: hash2 }).strict();

// src/lib/loopctl.ts
import { z as z3 } from "zod";
import { CommandExecutionError } from "@jackwener/opencli/errors";
var MAX_OUTPUT = 2 * 1024 * 1024;
var MAX_INPUT = 512 * 1024;
var jsonValue = z3.unknown();

// src/lib/catsco.ts
import { CommandExecutionError as CommandExecutionError2 } from "@jackwener/opencli/errors";
var MAX_OUTPUT2 = 128 * 1024;

// src/lib/catsco-bot-preflight.ts
import { createHash } from "node:crypto";
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ArgumentError, CommandExecutionError as CommandExecutionError3 } from "@jackwener/opencli/errors";
import { z as z4 } from "zod";
var MAX_CONFIG_BYTES = 16 * 1024;
var MAX_KEY_BYTES = 8 * 1024;
var MAX_RESPONSE_BYTES = 128 * 1024;
var MAX_RECEIPT_HISTORY = 100;
var REQUEST_TIMEOUT_MS = 15e3;
var TRUSTED_HTTP_BASE_URL = "https://app.catsco.cc";
var configSchema = z4.object({ version: z4.literal(1), transport: z4.literal("catsco-bot-preflight-v1"), httpBaseUrl: z4.string().min(1), expectedBotUid: z4.string().regex(/^[1-9]\d*$/), controllerUid: z4.literal("602").default("602"), apiKeyFile: z4.string().min(1) }).strict();
function configuredPath() {
  return process.env.LOOPCTL_BOT_PREFLIGHT_CONFIG?.trim() || join(homedir(), ".config", "loopctl", "catsco-bot-preflight.json");
}
function secureRead(path, maxBytes, label) {
  let fd;
  try {
    const before = lstatSync(path);
    if (before.isSymbolicLink() || !before.isFile()) throw new Error(`${label} must be a regular file`);
    if ((before.mode & 511) !== 384) throw new Error(`${label} must have mode 0600`);
    if (typeof process.getuid === "function" && before.uid !== process.getuid()) throw new Error(`${label} must be owned by the current user`);
    if (before.size > maxBytes) throw new Error(`${label} is too large`);
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const after = fstatSync(fd);
    if (!after.isFile() || (after.mode & 511) !== 384 || after.size > maxBytes || after.dev !== before.dev || after.ino !== before.ino || typeof process.getuid === "function" && after.uid !== process.getuid()) throw new Error(`${label} changed while opening or is unsafe`);
    return readFileSync(fd, "utf8");
  } finally {
    if (fd !== void 0) closeSync(fd);
  }
}
function loadConfig() {
  try {
    const c = configSchema.parse(JSON.parse(secureRead(configuredPath(), MAX_CONFIG_BYTES, "Bot preflight config")));
    const u = new URL(c.httpBaseUrl);
    if (c.httpBaseUrl !== TRUSTED_HTTP_BASE_URL || u.protocol !== "https:" || u.hostname !== "app.catsco.cc" || u.port || u.username || u.password || u.pathname !== "/" || u.search || u.hash) throw new Error(`httpBaseUrl must be exactly ${TRUSTED_HTTP_BASE_URL}`);
    if (!c.apiKeyFile.startsWith("/")) throw new Error("apiKeyFile must be an absolute path");
    return c;
  } catch (e) {
    throw new ArgumentError(`Bot preflight configuration is unavailable or invalid: ${e instanceof Error ? e.message : "invalid configuration"}`);
  }
}
function apiKey(c) {
  try {
    const v = secureRead(c.apiKeyFile, MAX_KEY_BYTES, "Bot preflight API key").trim();
    if (!v || /[\r\n\0]/.test(v)) throw new Error("Bot preflight API key is invalid");
    return v;
  } catch (e) {
    throw new ArgumentError(`Bot preflight API key is unavailable or invalid: ${e instanceof Error ? e.message : "invalid key"}`);
  }
}
async function boundedResponseText(r) {
  if (!r.body) throw new CommandExecutionError3("CatsCo Bot API response body is unavailable");
  const reader = r.body.getReader(), chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const n = await reader.read();
      if (n.done) break;
      bytes += n.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => void 0);
        throw new CommandExecutionError3("CatsCo Bot API response is too large");
      }
      chunks.push(n.value);
    }
  } finally {
    reader.releaseLock();
  }
  const all = new Uint8Array(bytes);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(all);
}
async function request(key, path, init) {
  const c = new AbortController(), timer = setTimeout(() => c.abort(), REQUEST_TIMEOUT_MS);
  try {
    const r = await fetch(`${TRUSTED_HTTP_BASE_URL}${path}`, { ...init, redirect: "error", signal: c.signal, headers: { Authorization: `ApiKey ${key}`, ...init.headers } });
    const text = await boundedResponseText(r);
    if (!r.ok) throw new CommandExecutionError3(`CatsCo Bot API request failed with HTTP ${r.status}`);
    try {
      return JSON.parse(text);
    } catch {
      throw new CommandExecutionError3("CatsCo Bot API returned invalid JSON");
    }
  } catch (e) {
    if (e instanceof CommandExecutionError3) throw e;
    throw new CommandExecutionError3(`CatsCo Bot API request failed: ${e instanceof Error ? e.name : "network error"}`);
  } finally {
    clearTimeout(timer);
  }
}
function record(v, label) {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new CommandExecutionError3(`CatsCo Bot API returned invalid ${label}`);
  return v;
}
function contentDigest(content) {
  return createHash("sha256").update(content).digest("hex");
}
async function authenticated(c, key) {
  const me = record(await request(key, "/api/me", { method: "GET" }), "identity");
  if (String(me.uid ?? "") !== c.expectedBotUid || String(me.account_type ?? "").toLowerCase() !== "bot") throw new CommandExecutionError3("CatsCo Bot API identity does not match configured Worker Bot");
}
function assertConfiguredControllerOwner(ownerUid) {
  if (ownerUid !== loadConfig().controllerUid) throw new ArgumentError("preflight packet ownerUid does not match configured Controller UID");
}
async function readNativePreflightPacket(receivedTopic) {
  if (!/^grp_[1-9]\d*$/.test(receivedTopic)) throw new ArgumentError("received-topic must be a numeric CatsCo group topic");
  const c = loadConfig(), key = apiKey(c);
  await authenticated(c, key);
  const response = record(await request(key, `/api/messages?topic_id=${encodeURIComponent(receivedTopic)}&latest=true&limit=1`, { method: "GET" }), "native Action message");
  if (!Array.isArray(response.messages) || response.messages.length !== 1) throw new CommandExecutionError3("CatsCo Bot API did not return exactly one native Action message");
  const row2 = record(response.messages[0], "native Action message");
  if (String(row2.topic_id ?? "") !== receivedTopic) throw new CommandExecutionError3("native Action message topic is invalid");
  if (String(row2.from_uid ?? row2.from ?? "") !== c.controllerUid) throw new CommandExecutionError3("native Action message Controller sender is invalid");
  if (!/^\d+$/.test(String(row2.id ?? "")) || String(row2.id) !== String(row2.seq_id ?? "")) throw new CommandExecutionError3("native Action message id/seq is invalid");
  if (String(row2.type ?? "") !== "text" || String(row2.msg_type ?? "text") !== "text") throw new CommandExecutionError3("native Action message type is invalid");
  for (const actor of [row2.actor_uid, row2.actorUid, row2.metadata && typeof row2.metadata === "object" ? row2.metadata.actor_uid : void 0]) if (actor !== void 0 && String(actor) !== c.controllerUid) throw new CommandExecutionError3("native Action message actor is invalid");
  const raw = row2.content;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : JSON.parse(canonicalJson(raw));
  } catch {
    throw new CommandExecutionError3("native Action message content is not a JSON packet");
  }
}
function isExactLatestReceipt(row2, receipt, expectedUid, content) {
  if (String(row2.id ?? "") !== receipt.messageId || String(row2.seq_id ?? "") !== receipt.seqId || String(row2.topic_id ?? "") !== receipt.topicId || String(row2.from_uid ?? row2.from ?? "") !== expectedUid || String(row2.type ?? "") !== "worker_ready") return false;
  try {
    return canonicalJson(row2.content) === content;
  } catch {
    return false;
  }
}
async function sendBotPreflightEvidence(topicId, content, clientMsgId, expectedUid, beforeSend) {
  const c = loadConfig();
  if (c.expectedBotUid !== expectedUid) throw new ArgumentError("Bot preflight config identity does not match signed packet principal");
  const key = apiKey(c);
  await authenticated(c, key);
  beforeSend?.();
  const sent = record(await request(key, "/api/messages/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic_id: topicId, client_msg_id: clientMsgId, content, msg_type: "text", type: "text" }) }), "send receipt");
  const receipt = { messageId: String(sent.id ?? ""), topicId: String(sent.topic_id ?? ""), clientMsgId: String(sent.client_msg_id ?? ""), seqId: String(sent.seq_id ?? ""), duplicate: sent.duplicate === true, contentDigest: contentDigest(content) };
  if (!receipt.messageId || !receipt.seqId || receipt.messageId !== receipt.seqId || receipt.topicId !== topicId || String(sent.from_uid ?? "") !== expectedUid || receipt.clientMsgId !== clientMsgId) throw new CommandExecutionError3("CatsCo Bot API send receipt failed verification");
  const history = record(await request(key, `/api/messages?topic_id=${encodeURIComponent(topicId)}&latest=true&limit=${MAX_RECEIPT_HISTORY}`, { method: "GET" }), "message receipt");
  if (!Array.isArray(history.messages) || history.messages.length === 0 || history.messages.length > MAX_RECEIPT_HISTORY) throw new CommandExecutionError3("CatsCo Bot API returned invalid latest message receipt");
  const newest = record(history.messages.at(-1), "message receipt");
  if (!isExactLatestReceipt(newest, receipt, expectedUid, content)) throw new CommandExecutionError3("CatsCo Bot API receipt was not server-confirmed");
  return receipt;
}

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
import { createHash as createHash2, createPublicKey, verify } from "node:crypto";
import { closeSync as closeSync2, constants as constants2, fstatSync as fstatSync2, lstatSync as lstatSync2, openSync as openSync2, readFileSync as readFileSync2 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { join as join2 } from "node:path";
import { ArgumentError as ArgumentError2 } from "@jackwener/opencli/errors";
import { z as z6 } from "zod";
var SIGNING_ALGORITHM = "ed25519";
var MAX_TRUSTED_KEYS_BYTES = 64 * 1024;
var trustedControllerKeysSchema = z6.object({
  version: z6.literal(1),
  keys: z6.array(z6.object({ ownerUid: z6.string().min(1), controllerKeyId: z6.string().min(1), publicKey: z6.string().min(1) }).strict())
}).strict();
function controllerCanonicalJson(value) {
  return JSON.stringify(normalize(value));
}
function normalize(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonical JSON rejects non-finite numbers");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if (item !== void 0) result[key] = normalize(item);
    }
    return result;
  }
  throw new TypeError(`canonical JSON rejects ${typeof value}`);
}
function controllerKeyId(publicKey) {
  return `controller-ed25519:${createHash2("sha256").update(publicKey).digest("base64url")}`;
}
function defaultTrustedKeysPath() {
  return join2(homedir2(), ".config", "loopctl", "trusted-controller-keys.json");
}
function trustedKeysPath() {
  const configured = process.env.LOOPCTL_TRUSTED_CONTROLLER_KEYS_FILE?.trim();
  return configured || defaultTrustedKeysPath();
}
function readTrustedKeysFile(path) {
  let descriptor;
  try {
    const pathStats = lstatSync2(path);
    if (pathStats.isSymbolicLink()) throw new Error("trusted Controller key file must not be a symbolic link");
    if (!pathStats.isFile()) throw new Error("trusted Controller key file must be a regular file");
    if ((pathStats.mode & 511) !== 384) throw new Error("trusted Controller key file must have mode 0600");
    descriptor = openSync2(path, constants2.O_RDONLY | constants2.O_NOFOLLOW);
    const descriptorStats = fstatSync2(descriptor);
    if (!descriptorStats.isFile()) throw new Error("trusted Controller key file must be a regular file");
    if ((descriptorStats.mode & 511) !== 384) throw new Error("trusted Controller key file must have mode 0600");
    if (descriptorStats.size > MAX_TRUSTED_KEYS_BYTES) throw new Error("trusted Controller key file is too large");
    if (typeof process.getuid === "function" && descriptorStats.uid !== process.getuid()) throw new Error("trusted Controller key file must be owned by the current user");
    if (descriptorStats.dev !== pathStats.dev || descriptorStats.ino !== pathStats.ino) throw new Error("trusted Controller key file changed while opening");
    return readFileSync2(descriptor, "utf8");
  } finally {
    if (descriptor !== void 0) closeSync2(descriptor);
  }
}
function trustedKey(packet) {
  let config;
  try {
    config = trustedControllerKeysSchema.parse(JSON.parse(readTrustedKeysFile(trustedKeysPath())));
    const identities = /* @__PURE__ */ new Set();
    for (const key of config.keys) {
      const identity = `${key.ownerUid}\0${key.controllerKeyId}`;
      if (identities.has(identity)) throw new Error("trusted Controller key configuration has duplicate owner/key entries");
      identities.add(identity);
      if (key.controllerKeyId !== controllerKeyId(key.publicKey)) throw new Error("trusted Controller key configuration has an invalid key ID");
      if (createPublicKey(key.publicKey).asymmetricKeyType !== SIGNING_ALGORITHM) throw new Error("trusted Controller key configuration has a non-Ed25519 public key");
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid configuration";
    throw new ArgumentError2(`trusted Controller key configuration is unavailable or invalid: ${detail}`);
  }
  const matches = config.keys.filter((key) => key.ownerUid === packet.ownerUid && key.controllerKeyId === packet.controllerKeyId);
  if (matches.length !== 1) throw new ArgumentError2("preflight packet Controller key is not pinned for its owner");
  const pin = matches[0];
  if (pin.publicKey !== packet.controllerPublicKey) throw new ArgumentError2("preflight packet Controller public key does not match its trusted pin");
  return pin;
}
function verifyTrustedControllerPreflightPacket(packet) {
  if (packet.controllerSignatureAlgorithm !== SIGNING_ALGORITHM) throw new ArgumentError2("preflight packet Controller signature algorithm is invalid");
  if (packet.controllerKeyId !== controllerKeyId(packet.controllerPublicKey)) throw new ArgumentError2("preflight packet Controller key ID does not match its public key");
  trustedKey(packet);
  const { controllerSignature: _signature, packetDigest, ...withoutDigest } = packet;
  const expectedDigest = createHash2("sha256").update(controllerCanonicalJson(withoutDigest)).digest("hex");
  if (packetDigest !== expectedDigest) throw new ArgumentError2("preflight packet packetDigest does not match the canonical Controller action packet");
  const { controllerSignature: _ignoredSignature, ...signaturePayload } = packet;
  try {
    const verified = verify(null, Buffer.from(controllerCanonicalJson(signaturePayload)), createPublicKey(packet.controllerPublicKey), Buffer.from(packet.controllerSignature, "base64"));
    if (!verified) throw new Error("signature mismatch");
  } catch {
    throw new ArgumentError2("preflight packet Controller signature is invalid");
  }
}

// src/lib/commands.ts
var numericCatscoPrincipal = /^catsco-user:([1-9]\d*)$/;
var numericGroupTopic = /^grp_[1-9]\d*$/;
var stableId = (prefix, parts) => `${prefix}:${createHash3("sha256").update(parts.join("\0")).digest("hex")}`;
function assertFutureLease(packet) {
  if (Date.parse(packet.leaseExpiresAt) <= Date.now()) throw new ArgumentError3("preflight packet leaseExpiresAt must be in the future");
}
function validateWorkerPreflightPacket(packet, receivedTopic) {
  assertFutureLease(packet);
  const principalMatch = numericCatscoPrincipal.exec(packet.runtimePrincipal);
  if (!principalMatch) throw new ArgumentError3("preflight packet runtime principal must be a numeric CatsCo Bot principal");
  const principal = `catsco-user:${principalMatch[1]}`;
  if (!numericGroupTopic.test(receivedTopic)) throw new ArgumentError3("received-topic must be a numeric CatsCo group topic");
  if (!/^[1-9]\d*$/.test(packet.catscoProjectId)) throw new ArgumentError3("preflight packet catscoProjectId must be numeric");
  if (packet.actionId !== packet.action.id || packet.actionKey !== packet.action.key || packet.kind !== packet.action.kind || packet.workItemRevision !== packet.action.workItemRevision || packet.targetPrincipal !== packet.action.targetPrincipal || packet.targetTopicId !== packet.action.targetTopicId || packet.targetDigest !== packet.action.targetDigest) {
    throw new ArgumentError3("preflight packet action duplicates do not agree");
  }
  if (packet.targetPrincipal !== principal || packet.runtimePrincipal !== principal) {
    throw new ArgumentError3("preflight packet target/runtime principal does not match authenticated CatsCo Bot");
  }
  if (packet.targetTopicId !== receivedTopic || packet.workerTopicId !== receivedTopic) {
    throw new ArgumentError3("preflight packet execution topic does not match received-topic");
  }
  if (!numericGroupTopic.test(packet.evidenceTopicId) || packet.evidenceTopicId === receivedTopic) {
    throw new ArgumentError3("preflight packet evidenceTopicId must be a distinct numeric CatsCo group topic");
  }
  const sessionId = `session:v2:catscompany:group:${receivedTopic}:agent:${principalMatch[1]}`;
  if (packet.workerSessionId !== sessionId) throw new ArgumentError3("preflight packet workerSessionId is not the canonical Worker session");
}
async function preflightReady(kwargs) {
  if (kwargs["packet-file"] !== void 0) throw new ArgumentError3("packet-file is not supported; preflight reads the native Bot-authenticated Action");
  const receivedTopic = String(kwargs["received-topic"] ?? "");
  let packet;
  try {
    packet = workerPreflightPacketSchema.parse(await readNativePreflightPacket(receivedTopic));
  } catch (error) {
    throw new ArgumentError3(error instanceof Error ? error.message : "invalid native Controller preflight packet");
  }
  assertConfiguredControllerOwner(packet.ownerUid);
  verifyTrustedControllerPreflightPacket(packet);
  validateWorkerPreflightPacket(packet, receivedTopic);
  const parts = [packet.actionKey, "worker_ready", packet.attemptId, String(packet.generation), String(packet.workItemRevision), packet.workerSessionId];
  const event = workerReady.parse({
    type: "worker_ready",
    eventId: stableId("loop-event", parts),
    idempotencyKey: stableId("loop-evidence", parts),
    source: packet.runtimePrincipal,
    entityRef: `attempt:${packet.attemptId}`,
    payload: {
      workItemId: packet.workItemId,
      expectedRevision: packet.workItemRevision,
      attemptId: packet.attemptId,
      generation: packet.generation,
      runtimePrincipal: packet.runtimePrincipal,
      workerSessionId: packet.workerSessionId,
      signature: "catsco-message-attested"
    }
  });
  const content = canonicalJson(event);
  const botUid = numericCatscoPrincipal.exec(packet.runtimePrincipal)[1];
  const receipt = await sendBotPreflightEvidence(packet.evidenceTopicId, content, event.idempotencyKey, botUid, () => assertFutureLease(packet));
  return { targetTopicId: packet.evidenceTopicId, event: JSON.parse(content), receipt };
}

// loop-preflight-ready.ts
cli({
  site: "loop",
  name: "preflight-ready",
  description: "Worker-only: server-read the native preflight packet and receipt-submit worker_ready",
  access: "write",
  browser: false,
  strategy: Strategy.LOCAL,
  args: [
    { name: "received-topic", help: "Native received CatsCo grp_<id> topic", required: true }
  ],
  columns: ["targetTopicId", "event", "receipt"],
  defaultFormat: "json",
  func: preflightReady
});
