#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { URL, URLSearchParams } = require("url");

const ROOT = __dirname;

function helpText() {
  return [
    "ShellCrash Sub Updater",
    "",
    "Usage:",
    "  node updater.js --config config.json",
    "  node updater.js --config config.json --convert-only",
    "  node updater.js --config config.json --upload-only [--local-yaml ./out/clash.yaml]",
    "",
    "Options:",
    "  --config <file>      Path to config.json",
    "  --convert-only       Only convert subscription to YAML",
    "  --upload-only        Only upload an existing YAML file",
    "  --local-yaml <file>  YAML file to upload with --upload-only",
    "  --no-restart         Validate config but do not restart ShellCrash",
    "  --help               Show this help text"
  ].join("\n");
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

function logStage(stage) {
  log(`[stage] ${stage}`);
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = { config: path.join(ROOT, "config.json") };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--help" || argv[i] === "-h") {
      process.stdout.write(`${helpText()}\n`);
      process.exit(0);
    }
    if (argv[i] === "--config") args.config = argv[++i];
    else if (argv[i] === "--no-restart") args.noRestart = true;
    else if (argv[i] === "--convert-only") args.convertOnly = true;
    else if (argv[i] === "--upload-only") args.uploadOnly = true;
    else if (argv[i] === "--local-yaml") args.localYaml = argv[++i];
    else fail(`Unknown argument: ${argv[i]}`);
  }
  if (args.convertOnly && args.uploadOnly) fail("--convert-only and --upload-only cannot be used together.");
  return args;
}

function readJson(file) {
  if (!fs.existsSync(file)) {
    fail(`Config file not found: ${file}\nCopy config.example.json to config.json and edit it first.`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function platformAsset() {
  const p = process.platform;
  const a = process.arch;
  if (p === "darwin" && a === "arm64") return { key: "darwin-arm64", asset: "subconverter_darwinarm.tar.gz", exe: "subconverter" };
  if (p === "darwin" && a === "x64") return { key: "darwin-x64", asset: "subconverter_darwin64.tar.gz", exe: "subconverter" };
  if (p === "linux" && a === "arm64") return { key: "linux-arm64", asset: "subconverter_aarch64.tar.gz", exe: "subconverter" };
  if (p === "linux" && a === "arm") return { key: "linux-arm", asset: "subconverter_armv7.tar.gz", exe: "subconverter" };
  if (p === "linux" && a === "x64") return { key: "linux-x64", asset: "subconverter_linux64.tar.gz", exe: "subconverter" };
  if (p === "win32" && a === "x64") return { key: "win32-x64", asset: "subconverter_win64.7z", exe: "subconverter.exe" };
  if (p === "win32" && a === "ia32") return { key: "win32-ia32", asset: "subconverter_win32.7z", exe: "subconverter.exe" };
  fail(`Unsupported platform: ${p}/${a}`);
}

function requestBuffer(url, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.get(url, { timeout: timeoutMs, headers: { "User-Agent": "shellcrash-sub-updater" } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const redirected = new URL(res.headers.location, url).toString();
        requestBuffer(redirected, timeoutMs).then(resolve, reject);
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${redactUrl(url)}`));
        return;
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("timeout", () => req.destroy(new Error(`Timeout for ${redactUrl(url)}`)));
    req.on("error", reject);
  });
}

async function downloadFile(url, file) {
  log(`Downloading ${path.basename(file)}...`);
  const buf = await requestBuffer(url, 120000);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, buf);
}

function extractTarGz(archive, dest) {
  ensureDir(dest);
  const res = spawnSync("tar", ["-xzf", archive, "-C", dest], { stdio: "inherit" });
  if (res.status !== 0) fail("Failed to extract tar.gz archive. Make sure tar is available.");
}

async function extractArchive(archive, dest) {
  ensureDir(dest);

  if (archive.endsWith(".tar.gz")) {
    extractTarGz(archive, dest);
    return;
  }

  if (archive.endsWith(".7z")) {
    let sevenZip;
    try {
      sevenZip = require("7zip-min");
    } catch {
      fail("Missing dependency 7zip-min. Run npm install before using Windows .7z auto extraction.");
    }
    await sevenZip.unpack(archive, dest);
    return;
  }

  fail(`Unsupported archive format: ${archive}`);
}

async function ensureSubconverter(config) {
  const version = config.subconverter?.version || "v0.9.0";
  const asset = platformAsset();
  const installRoot = path.join(ROOT, "tools", "subconverter", version, asset.key);
  const exe = path.join(installRoot, "subconverter", asset.exe);
  if (fs.existsSync(exe)) return { exe, cwd: path.dirname(exe), asset };

  const archive = path.join(ROOT, "tools", "downloads", `${version}-${asset.asset}`);
  const url = `https://github.com/tindy2013/subconverter/releases/download/${version}/${asset.asset}`;
  if (!fs.existsSync(archive)) await downloadFile(url, archive);
  await extractArchive(archive, installRoot);
  if (!fs.existsSync(exe)) fail(`Expected executable not found after extraction: ${exe}`);
  if (process.platform !== "win32") fs.chmodSync(exe, 0o755);
  return { exe, cwd: path.dirname(exe), asset };
}

function waitForReady(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      http.get({ hostname: "127.0.0.1", port, path: "/sub", timeout: 1000 }, res => {
        res.resume();
        resolve();
      }).on("error", () => {
        if (Date.now() > deadline) reject(new Error(`subconverter did not become ready on 127.0.0.1:${port}`));
        else setTimeout(tick, 500);
      });
    };
    tick();
  });
}

async function startSubconverter(exe, cwd, portStart, portEnd) {
  let lastError;
  for (let port = portStart; port <= portEnd; port++) {
    const env = { ...process.env, PORT: String(port), LISTEN: "127.0.0.1" };
    const child = spawn(exe, [], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let logs = "";
    child.stdout.on("data", d => { logs += d.toString(); });
    child.stderr.on("data", d => { logs += d.toString(); });
    try {
      await waitForReady(port);
      return { child, port, logs: () => logs };
    } catch (e) {
      child.kill();
      lastError = `${e.message}\n${logs.slice(-2000)}`;
    }
  }
  fail(lastError || "Unable to start subconverter.");
}

async function convert(config, port) {
  const params = new URLSearchParams();
  const conv = config.conversion || {};
  params.set("target", conv.target || "clash");
  params.set("url", config.subscriptionUrl);
  params.set("insert", String(conv.insert ?? false));
  params.set("emoji", String(conv.emoji ?? false));
  params.set("new_name", String(conv.newName ?? true));
  params.set("udp", String(conv.udp ?? true));
  if (config.subconverter?.config) params.set("config", config.subconverter.config);
  const url = `http://127.0.0.1:${port}/sub?${params.toString()}`;
  const yaml = (await requestBuffer(url, 120000)).toString("utf8");
  if (!/^proxies:/m.test(yaml) || !/^proxy-groups:/m.test(yaml)) {
    fail("Converted output does not look like Clash/Mihomo YAML.");
  }
  const count = countProxyNodes(yaml);
  if (count <= 0) fail("Converted YAML has no proxy nodes.");
  return { yaml, count };
}

function countProxyNodes(yaml) {
  const start = yaml.indexOf("\nproxies:\n");
  const normalized = start >= 0 ? yaml.slice(start + 1) : yaml;
  const end = normalized.indexOf("\nproxy-groups:\n");
  const section = end >= 0 ? normalized.slice(0, end) : normalized;
  return (section.match(/^  - \{name:/gm) || []).length + (section.match(/^  - name:/gm) || []).length;
}

function sshBase(config) {
  const r = config.router;
  const key = path.resolve(ROOT, r.privateKey);
  return ["-i", key, ...sshOptions(r), `${r.user}@${r.host}`];
}

function sshOptions(router) {
  const opts = [...(router.sshOptions || [])];
  const joined = opts.join(" ");
  if (!/StrictHostKeyChecking=/i.test(joined)) opts.push("-o", "StrictHostKeyChecking=no");
  if (!/UserKnownHostsFile=/i.test(joined)) opts.push("-o", `UserKnownHostsFile=${path.join(ROOT, "known_hosts")}`);
  return opts;
}

function run(command, args, opts = {}) {
  const res = spawnSync(command, args, { encoding: "utf8", ...opts });
  if (res.status !== 0) {
    const detail = `${res.stdout || ""}${res.stderr || ""}`.trim();
    fail(`${command} failed${detail ? `:\n${detail}` : ""}`);
  }
  return res.stdout;
}

function upload(config, localYaml) {
  const remote = `${config.router.user}@${config.router.host}:${config.paths.remoteTmp}`;
  const key = path.resolve(ROOT, config.router.privateKey);
  const common = ["-i", key, ...sshOptions(config.router)];
  let res = spawnSync("scp", ["-O", ...common, localYaml, remote], { encoding: "utf8" });
  if (res.status !== 0) {
    res = spawnSync("scp", [...common, localYaml, remote], { encoding: "utf8" });
  }
  if (res.status !== 0) fail(`scp failed:\n${res.stdout}${res.stderr}`);
}

function firstYamlInOutDir() {
  const outDir = path.join(ROOT, "out");
  if (!fs.existsSync(outDir)) return null;
  const files = fs.readdirSync(outDir)
    .filter(name => /\.(ya?ml)$/i.test(name))
    .sort((a, b) => a.localeCompare(b));
  return files.length ? path.join(outDir, files[0]) : null;
}

function resolveUploadYaml(config, args) {
  if (args.localYaml) {
    const explicit = path.resolve(process.cwd(), args.localYaml);
    if (!fs.existsSync(explicit)) fail(`YAML file does not exist: ${explicit}`);
    return explicit;
  }

  const firstOutYaml = firstYamlInOutDir();
  if (firstOutYaml) return firstOutYaml;

  const configured = path.resolve(ROOT, config.paths.localYaml || "./out/clash.yaml");
  if (fs.existsSync(configured)) return configured;
  fail("No YAML file found. Generate one first or pass --local-yaml.");
}

function installRemote(config, restart) {
  const p = config.paths;
  const script = `
set -e
CRASHDIR=${sh(p.remoteShellCrashDir)}
TMPDIR=${sh(p.remoteShellCrashTmpDir)}
BINDIR=${sh(p.remoteShellCrashDir)}
mkdir -p "$TMPDIR" "$CRASHDIR/yamls"
cp ${sh(p.remoteShellCrashYaml)} "$CRASHDIR/yamls/config.yaml.bak-updater-$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
cp ${sh(p.remoteTmp)} ${sh(p.remoteShellCrashYaml)}
cp ${sh(p.remoteTmp)} ${sh(p.remoteShellCrashTmpYaml)}
. "$CRASHDIR/libs/set_config.sh"
setconfig Url
setconfig Https
setconfig crashcore meta
setconfig cpucore arm64
"$TMPDIR/CrashCore" -t -d "$BINDIR" -f ${sh(p.remoteShellCrashTmpYaml)}
${restart ? 'if "$CRASHDIR/start.sh" restart 2>/dev/null; then :; else "$CRASHDIR/start.sh" stop; "$CRASHDIR/start.sh" start; fi' : 'true'}
`;
  run("ssh", [...sshBase(config), script], { stdio: "inherit" });
}

function sh(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function redactUrl(value) {
  try {
    const u = new URL(value);
    if (u.search) u.search = "?<redacted>";
    return u.toString();
  } catch {
    return "<redacted>";
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const configPath = path.resolve(process.cwd(), args.config);
  const config = readJson(configPath);
  if (!config.subscriptionUrl) fail("config.subscriptionUrl is required.");
  logStage("preparing");
  if (args.uploadOnly) {
    logStage("reading-yaml");
    const localYaml = resolveUploadYaml(config, args);
    log(`Using YAML ${localYaml}`);
    logStage("uploading-router");
    log("Uploading to router...");
    upload(config, localYaml);
    logStage("installing-shellcrash");
    logStage("validating-config");
    if (!args.noRestart && config.restartShellCrash !== false) {
      logStage("restarting-shellcrash");
    }
    log("Installing on ShellCrash and testing config...");
    installRemote(config, !args.noRestart && config.restartShellCrash !== false);
    logStage("finished");
    log("Done.");
    return;
  }

  const sub = await ensureSubconverter(config);
  const portStart = config.subconverter?.portStart || 25500;
  const portEnd = config.subconverter?.portEnd || portStart;
  logStage("starting-subconverter");
  log(`Starting local subconverter (${sub.asset.key})...`);
  const svc = await startSubconverter(sub.exe, sub.cwd, portStart, portEnd);
  try {
    logStage("converting");
    log(`Converting subscription locally on 127.0.0.1:${svc.port}...`);
    const { yaml, count } = await convert(config, svc.port);
    const out = path.resolve(ROOT, config.paths.localYaml || "./out/clash.yaml");
    ensureDir(path.dirname(out));
    fs.writeFileSync(out, yaml);
    logStage("writing-yaml");
    log(`Wrote ${out}`);
    log(`Proxy nodes: ${count}`);
    if (!args.convertOnly) {
      logStage("uploading-router");
      log("Uploading to router...");
      upload(config, out);
      logStage("installing-shellcrash");
      logStage("validating-config");
      if (!args.noRestart && config.restartShellCrash !== false) {
        logStage("restarting-shellcrash");
      }
      log("Installing on ShellCrash and testing config...");
      installRemote(config, !args.noRestart && config.restartShellCrash !== false);
    }
    logStage("finished");
    log("Done.");
  } finally {
    svc.child.kill();
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
