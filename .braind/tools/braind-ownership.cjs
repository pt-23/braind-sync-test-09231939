#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/cli/braindOwnership.ts
var import_child_process2 = require("child_process");

// src/main/ownershipGit.ts
var import_child_process = require("child_process");
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));

// src/shared/ownership.ts
var PROTECTED_REPO_PATHS = [/^\.github\//, /^\.gitlab-ci\.yml$/, /^CODEOWNERS$/, /^\.gitlab\/CODEOWNERS$/];
var ROOT_OWNED_FILES = /* @__PURE__ */ new Set(["workspace.json", "people.json", ".gitignore", ".gitattributes"]);
function actsAs(author, owner, people) {
  if (!owner) return false;
  if (author === owner) return true;
  const team = people.teams.find((t) => t.alias === owner);
  return !!team && team.members.includes(author);
}
function checkChanges(changes, ctx) {
  if (ctx.rootOwner === null) return [];
  const violations = [];
  const deny = (path2, reason, owner) => {
    violations.push({ path: path2, reason, ...owner ? { owner } : {} });
  };
  const rootOwner = ctx.rootOwner;
  for (const change of changes) {
    const { path: path2 } = change;
    if (!path2.startsWith(ctx.braindPrefix)) {
      if (PROTECTED_REPO_PATHS.some((re) => re.test(path2)) && !actsAs(ctx.author, rootOwner, ctx.people)) {
        deny(path2, "Only the root owner can change CI and code-owner settings.", rootOwner);
      }
      continue;
    }
    const rel = path2.slice(ctx.braindPrefix.length);
    const segments = rel.split("/");
    if (segments[0] === "local") {
      deny(path2, "Files under local/ are personal and must never be committed.");
      continue;
    }
    if (segments[0] !== "nodes" || segments.length < 3) {
      if (!actsAs(ctx.author, rootOwner, ctx.people)) {
        const what = ROOT_OWNED_FILES.has(rel) ? rel : "workspace-level files";
        deny(path2, `Only the root owner can change ${what}.`, rootOwner);
      }
      continue;
    }
    const nodeId = segments[1];
    const base = ctx.baseRecord(nodeId);
    if (segments[2] === "requests" && segments.length > 3) {
      if (change.kind === "added") continue;
      const creator = ctx.fileCreator(path2);
      if (creator !== ctx.author) {
        deny(path2, "Only the person who wrote a request can change or remove it.", creator ?? void 0);
      }
      continue;
    }
    if (base) {
      if (!actsAs(ctx.author, base.owner, ctx.people)) {
        deny(path2, `This node belongs to @${base.owner}.`, base.owner);
      }
      continue;
    }
    const head = ctx.headRecord(nodeId);
    if (!head) {
      deny(path2, "A new node needs its node.json in the same change.");
      continue;
    }
    const parent = head.parentId ? ctx.baseRecord(head.parentId) ?? ctx.headRecord(head.parentId) : null;
    if (!parent) {
      deny(path2, "A new node must be created under an existing node.");
      continue;
    }
    if (!actsAs(ctx.author, parent.owner, ctx.people)) {
      deny(path2, `Only @${parent.owner} can add nodes under "${parent.title}".`, parent.owner);
    }
  }
  return dedupeByNode(violations, ctx.braindPrefix);
}
function dedupeByNode(violations, braindPrefix) {
  const seen = /* @__PURE__ */ new Set();
  return violations.filter((v) => {
    const m = v.path.startsWith(braindPrefix + "nodes/") ? v.path.slice(braindPrefix.length).split("/").slice(0, 2).join("/") : v.path;
    const key = `${m}\0${v.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function resolveAuthor(people, who) {
  const byHost = who.hostUsername ? people.people.find((p) => p.hostUsername?.toLowerCase() === who.hostUsername.toLowerCase()) : void 0;
  if (byHost) return byHost.alias;
  const byEmail = who.email ? people.people.find((p) => p.emails.includes(who.email)) : void 0;
  return byEmail?.alias ?? null;
}

// src/main/ownershipGit.ts
function git(repo, args) {
  return (0, import_child_process.execFileSync)("git", args, { cwd: repo, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
}
function gitOrNull(repo, args) {
  try {
    return (0, import_child_process.execFileSync)("git", args, { cwd: repo, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}
function repoRootOf(dir) {
  return git(dir, ["rev-parse", "--show-toplevel"]).trim();
}
function readAt(repo, side, file) {
  if (side.kind === "worktree") {
    try {
      return import_fs.default.readFileSync(import_path.default.join(repo, file), "utf-8");
    } catch {
      return null;
    }
  }
  const spec = side.kind === "index" ? `:${file}` : `${side.ref}:${file}`;
  return gitOrNull(repo, ["show", spec]);
}
function readJsonAt(repo, side, file) {
  const raw = readAt(repo, side, file);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function toKind(status) {
  if (status.startsWith("A") || status === "??") return "added";
  if (status.startsWith("D")) return "deleted";
  return "modified";
}
function collectChanges(repo, baseRef, head) {
  if (head.kind === "worktree") {
    const out = git(repo, ["status", "--porcelain=v1", "-uall", "--no-renames", "-z"]);
    return out.split("\0").filter(Boolean).map((line) => {
      const xy = line.slice(0, 2);
      const kind = xy === "??" ? "added" : xy.includes("D") ? "deleted" : xy.includes("A") ? "added" : "modified";
      return { path: line.slice(3), kind };
    });
  }
  const args = head.kind === "index" ? ["diff", "--cached", "--name-status", "--no-renames", "-z", baseRef] : ["diff", "--name-status", "--no-renames", "-z", baseRef, head.ref];
  const parts = git(repo, args).split("\0").filter(Boolean);
  const changes = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    changes.push({ path: parts[i + 1], kind: toKind(parts[i]) });
  }
  return changes;
}
function checkOwnership(opts) {
  const { repo, braindPrefix, baseRef, head } = opts;
  const base = { kind: "ref", ref: baseRef };
  if (gitOrNull(repo, ["rev-parse", "--verify", "--quiet", `${baseRef}^{commit}`]) === null) {
    return { author: null, violations: [] };
  }
  const changes = collectChanges(repo, baseRef, head).filter((c) => c.path !== "");
  if (changes.length === 0) return { author: null, violations: [] };
  const baseWorkspace = readJsonAt(repo, base, `${braindPrefix}workspace.json`);
  const people = readJsonAt(repo, base, `${braindPrefix}people.json`) ?? {
    schemaVersion: 1,
    people: [],
    teams: []
  };
  const author = resolveAuthor(people, opts.author);
  const recordCache = /* @__PURE__ */ new Map();
  const record = (side, nodeId) => {
    const key = `${side.kind}:${side.kind === "ref" ? side.ref : ""}:${nodeId}`;
    if (!recordCache.has(key)) {
      recordCache.set(key, readJsonAt(repo, side, `${braindPrefix}nodes/${nodeId}/node.json`));
    }
    return recordCache.get(key) ?? null;
  };
  const rootOwner = baseWorkspace ? record(base, baseWorkspace.rootId)?.owner ?? null : null;
  if (rootOwner !== null && author === null) {
    const who = opts.author.hostUsername ?? opts.author.email ?? "unknown";
    return {
      author: null,
      violations: [
        {
          path: `${braindPrefix}people.json`,
          reason: `${who} isn't listed in people.json. Ask the root owner (@${rootOwner}) to add you.`
        }
      ]
    };
  }
  const ctx = {
    author: author ?? "",
    braindPrefix,
    people,
    rootOwner,
    baseRecord: (id) => record(base, id),
    headRecord: (id) => record(head, id),
    fileCreator: (file) => {
      const email = gitOrNull(repo, ["log", "--diff-filter=A", "--format=%ae", "-1", baseRef, "--", file])?.trim();
      return email ? resolveAuthor(people, { email }) : null;
    }
  };
  return { author, violations: checkChanges(changes, ctx) };
}

// src/cli/braindOwnership.ts
function usage(message) {
  console.error(`braind-ownership: ${message}`);
  console.error("usage: braind-ownership (--base <ref> --head <ref> | --staged | --worktree) [--workspace <dir>]");
  console.error("                        [--author-host <username>] [--author-email <email>]");
  process.exit(2);
}
var KNOWN_OPTIONS = /* @__PURE__ */ new Set(["base", "head", "staged", "worktree", "workspace", "author-host", "author-email"]);
function parseArgs(argv) {
  const args = /* @__PURE__ */ new Map();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) usage(`unexpected argument "${arg}"`);
    const [key, inline] = arg.slice(2).split(/=(.*)/s);
    if (!KNOWN_OPTIONS.has(key)) usage(`unknown option --${key}`);
    if (inline !== void 0) args.set(key, inline);
    else if (argv[i + 1] !== void 0 && !argv[i + 1].startsWith("--")) args.set(key, argv[++i]);
    else args.set(key, true);
  }
  return args;
}
function str(args, key) {
  const v = args.get(key);
  if (v === true) usage(`--${key} needs a value`);
  return v;
}
function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = repoRootOf(process.cwd());
  let baseRef = "HEAD";
  let head;
  if (args.has("staged")) head = { kind: "index" };
  else if (args.has("worktree")) head = { kind: "worktree" };
  else {
    const base = str(args, "base");
    const headRef = str(args, "head");
    if (!base || !headRef) usage("give --base and --head, or --staged, or --worktree");
    baseRef = base;
    head = { kind: "ref", ref: headRef };
  }
  const workspace = (str(args, "workspace") ?? ".braind").replace(/\/+$/, "");
  let email = str(args, "author-email");
  const hostUsername = str(args, "author-host");
  if (!email && !hostUsername) {
    try {
      email = (0, import_child_process2.execFileSync)("git", ["config", "--get", "user.email"], { cwd: repo, encoding: "utf-8" }).trim();
    } catch {
      usage("no author: pass --author-host or --author-email, or set git config user.email");
    }
  }
  const { author, violations } = checkOwnership({
    repo,
    braindPrefix: `${workspace}/`,
    baseRef,
    head,
    author: { hostUsername, email }
  });
  if (violations.length === 0) {
    console.log(`braind-ownership: ok${author ? ` (@${author})` : ""}`);
    return;
  }
  const inActions = process.env.GITHUB_ACTIONS === "true";
  console.error(`braind-ownership: ${violations.length} change(s) outside what ${author ? `@${author}` : "this author"} owns:`);
  for (const v of violations) {
    if (inActions) console.log(`::error file=${v.path}::${v.reason}`);
    console.error(`  ${v.path}
    ${v.reason}${v.owner ? ` Ask @${v.owner}, or turn it into a question for them.` : ""}`);
  }
  process.exit(1);
}
main();
