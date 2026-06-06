#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const { URL } = require("url");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const CONFIG_PATH = path.join(ROOT, "config.json");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const MAX_BODY_BYTES = 10 * 1024 * 1024;

let running = false;

function helpText() {
  return [
    "ShellCrash Sub Updater Web UI",
    "",
    "Usage:",
    "  node web.js",
    "  HOST=127.0.0.1 PORT=3001 node web.js",
    "",
    "Environment variables:",
    "  HOST   Bind host, default 127.0.0.1",
    "  PORT   Bind port, default 3000",
    "",
    "Notes:",
    "  config.json must exist before starting the Web UI."
  ].join("\n");
}

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error("缺少 config.json。请先复制 config.example.json 为 config.json 并修改配置。");
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendText(res, status, text, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Content-Length": Buffer.byteLength(text)
  });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      chunks.push(chunk);
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON request body"));
      }
    });
    req.on("error", reject);
  });
}

function publicFile(file) {
  const target = path.resolve(PUBLIC_DIR, file);
  const relative = path.relative(PUBLIC_DIR, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return target;
}

function updateConfigFromPayload(payload) {
  const config = readConfig();
  if (typeof payload.subscriptionUrl === "string") {
    const value = payload.subscriptionUrl.trim();
    if (!/^https?:\/\//i.test(value)) throw new Error("订阅地址必须以 http:// 或 https:// 开头");
    config.subscriptionUrl = value;
  }
  if (typeof payload.routerHost === "string" && payload.routerHost.trim()) {
    config.router.host = payload.routerHost.trim();
  }
  if (typeof payload.privateKey === "string" && payload.privateKey.trim()) {
    config.router.privateKey = payload.privateKey.trim();
  }
  if (typeof payload.localYaml === "string" && payload.localYaml.trim()) {
    config.paths.localYaml = payload.localYaml.trim();
  }
  if (typeof payload.restartShellCrash === "boolean") {
    config.restartShellCrash = payload.restartShellCrash;
  }
  writeConfig(config);
  return config;
}

function safeUploadName(name) {
  const base = path.basename(String(name || "selected.yaml")).replace(/[^a-zA-Z0-9._-]/g, "_");
  return /\.(ya?ml)$/i.test(base) ? base : `${base}.yaml`;
}

function saveUploadedYaml(payload) {
  if (typeof payload.yamlText !== "string" || !payload.yamlText.trim()) return null;
  const yamlText = payload.yamlText.replace(/^\uFEFF/, "");
  if (!/^proxies:/m.test(yamlText) || !/^proxy-groups:/m.test(yamlText)) {
    throw new Error("选择的文件不像 Clash/Mihomo YAML，缺少 proxies 或 proxy-groups");
  }
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const file = path.join(UPLOAD_DIR, `${stamp}-${safeUploadName(payload.yamlName)}`);
  fs.writeFileSync(file, yamlText);
  return file;
}

function runUpdater(args) {
  if (running) throw new Error("已有任务正在运行，请等待完成");
  running = true;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["updater.js", "--config", "config.json", ...args], {
      cwd: ROOT,
      env: process.env
    });
    let output = "";
    child.stdout.on("data", data => { output += data.toString(); });
    child.stderr.on("data", data => { output += data.toString(); });
    child.on("close", code => {
      running = false;
      resolve({ ok: code === 0, code, output });
    });
    child.on("error", error => {
      running = false;
      resolve({ ok: false, code: -1, output: error.message });
    });
  });
}

async function handleApi(req, res, url) {
  try {
    if (req.method === "GET" && url.pathname === "/api/config") {
      const config = readConfig();
      sendJson(res, 200, {
        subscriptionUrl: config.subscriptionUrl,
        routerHost: config.router?.host,
        privateKey: config.router?.privateKey,
        localYaml: config.paths?.localYaml,
        restartShellCrash: config.restartShellCrash !== false,
        running
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/config") {
      const payload = await readBody(req);
      const config = updateConfigFromPayload(payload);
      sendJson(res, 200, {
        ok: true,
        subscriptionUrl: config.subscriptionUrl,
        routerHost: config.router.host,
        privateKey: config.router.privateKey,
        localYaml: config.paths.localYaml,
        restartShellCrash: config.restartShellCrash !== false
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/convert") {
      const payload = await readBody(req);
      updateConfigFromPayload(payload);
      const result = await runUpdater(["--convert-only"]);
      sendJson(res, result.ok ? 200 : 500, result);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/upload") {
      const payload = await readBody(req);
      const config = updateConfigFromPayload(payload);
      const args = [];
      if (payload.noRestart || config.restartShellCrash === false) args.push("--no-restart");
      const result = await runUpdater(args);
      sendJson(res, result.ok ? 200 : 500, result);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/upload-yaml") {
      const payload = await readBody(req);
      const config = updateConfigFromPayload(payload);
      const uploadedYaml = saveUploadedYaml(payload);
      const args = ["--upload-only"];
      if (uploadedYaml) args.push("--local-yaml", uploadedYaml);
      if (payload.noRestart || config.restartShellCrash === false) args.push("--no-restart");
      const result = await runUpdater(args);
      sendJson(res, result.ok ? 200 : 500, {
        ...result,
        source: uploadedYaml ? "selected-file" : "out-directory",
        localYaml: uploadedYaml
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/download") {
      const config = readConfig();
      const yamlPath = path.resolve(ROOT, config.paths.localYaml || "./out/clash.yaml");
      const relative = path.relative(ROOT, yamlPath);
      if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(yamlPath)) {
        sendJson(res, 404, { ok: false, error: "YAML 文件不存在，请先转换" });
        return;
      }
      const body = fs.readFileSync(yamlPath);
      res.writeHead(200, {
        "Content-Type": "application/x-yaml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${path.basename(yamlPath)}"`,
        "Content-Length": body.length
      });
      res.end(body);
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message });
  }
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url);
    return;
  }

  const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const target = publicFile(file);
  if (!target || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    sendText(res, 404, "Not found");
    return;
  }
  const ext = path.extname(target);
  const type = ext === ".html" ? "text/html; charset=utf-8" : "application/octet-stream";
  sendText(res, 200, fs.readFileSync(target), type);
}

function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    process.stdout.write(`${helpText()}\n`);
    return;
  }
  const port = Number(process.env.PORT || DEFAULT_PORT);
  const host = process.env.HOST || DEFAULT_HOST;
  const server = http.createServer((req, res) => {
    handle(req, res).catch(error => sendJson(res, 500, { ok: false, error: error.message }));
  });
  server.listen(port, host, () => {
    console.log(`ShellCrash updater UI: http://${host}:${port}`);
  });
}

main();
