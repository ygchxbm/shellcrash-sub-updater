#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { URL } = require("url");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const CONFIG_PATH = path.join(ROOT, "config.json");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const MAX_BODY_BYTES = 10 * 1024 * 1024;

const STAGE_LABELS = {
  preparing: "准备配置",
  "reading-yaml": "定位 YAML 文件",
  "starting-subconverter": "启动 subconverter",
  converting: "转换订阅",
  "writing-yaml": "写入 YAML",
  "uploading-router": "上传到路由器",
  "installing-shellcrash": "安装到 ShellCrash",
  "validating-config": "校验配置",
  "restarting-shellcrash": "重启 ShellCrash",
  finished: "完成"
};

const TASK_STAGES = {
  convert: ["preparing", "starting-subconverter", "converting", "writing-yaml", "finished"],
  upload: ["preparing", "starting-subconverter", "converting", "writing-yaml", "uploading-router", "installing-shellcrash", "validating-config", "restarting-shellcrash", "finished"],
  "upload-yaml": ["preparing", "reading-yaml", "uploading-router", "installing-shellcrash", "validating-config", "restarting-shellcrash", "finished"]
};

let currentTaskId = null;
const tasks = new Map();

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
      } catch {
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

function stageLabel(stage) {
  return STAGE_LABELS[stage] || stage;
}

function activeTask() {
  return currentTaskId ? tasks.get(currentTaskId) || null : null;
}

function isTaskRunning(task) {
  return !!task && (task.status === "queued" || task.status === "running");
}

function taskSnapshot(task) {
  return {
    id: task.id,
    type: task.type,
    status: task.status,
    stage: task.stage,
    stageLabel: task.stageLabel,
    stages: task.stages,
    logs: task.logs,
    startedAt: task.startedAt,
    endedAt: task.endedAt,
    result: task.result,
    restartShellCrash: task.restartShellCrash,
    cancelled: task.status === "cancelled",
    running: isTaskRunning(task)
  };
}

function setTaskStage(task, stage) {
  if (!stage || task.stage === stage) return;
  task.stage = stage;
  task.stageLabel = stageLabel(stage);
  if (stage === "finished" && task.status === "running") {
    task.status = "success";
  } else if (task.status === "queued") {
    task.status = "running";
  }
}

function appendLogLine(task, line) {
  const trimmed = line.replace(/\r$/, "");
  if (!trimmed) return;
  const match = trimmed.match(/^\[stage\]\s+([a-z-]+)$/);
  if (match) {
    setTaskStage(task, match[1]);
    return;
  }
  task.logs.push(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] ${trimmed}`);
}

function attachLineReader(task, stream) {
  let buffer = "";
  stream.on("data", chunk => {
    buffer += chunk.toString();
    const lines = buffer.split(/\n/);
    buffer = lines.pop();
    for (const line of lines) appendLogLine(task, line);
  });
  stream.on("end", () => {
    if (buffer) appendLogLine(task, buffer);
  });
}

function createTask(type, options) {
  const existing = activeTask();
  if (isTaskRunning(existing)) {
    const error = new Error("已有任务正在运行，请等待完成");
    error.statusCode = 409;
    throw error;
  }

  const restartShellCrash = options.noRestart ? false : options.restartShellCrash !== false;
  const stages = TASK_STAGES[type].filter(stage => restartShellCrash || stage !== "restarting-shellcrash");
  const task = {
    id: crypto.randomUUID(),
    type,
    status: "queued",
    stage: "preparing",
    stageLabel: stageLabel("preparing"),
    stages,
    logs: [],
    startedAt: new Date().toISOString(),
    endedAt: null,
    result: null,
    restartShellCrash
  };

  tasks.set(task.id, task);
  currentTaskId = task.id;

  const args = ["updater.js", "--config", "config.json", ...options.args];
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    env: process.env,
    detached: process.platform !== "win32"
  });
  task.child = child;
  attachLineReader(task, child.stdout);
  attachLineReader(task, child.stderr);
  setTaskStage(task, "preparing");

  child.on("close", code => {
    if (task.status === "cancelled") {
      task.result = {
        ok: false,
        code,
        output: task.logs.join("\n"),
        source: options.source,
        localYaml: options.localYaml || null,
        cancelled: true
      };
    } else if (task.status !== "error") {
      if (code === 0) {
        setTaskStage(task, "finished");
        task.status = "success";
      } else {
        task.status = "error";
        appendLogLine(task, `任务失败：子进程退出码 ${code}，当前阶段 ${task.stageLabel}`);
      }
      task.result = {
        ok: code === 0,
        code,
        output: task.logs.join("\n"),
        source: options.source,
        localYaml: options.localYaml || null
      };
    }
    task.endedAt = new Date().toISOString();
    task.child = null;
    if (currentTaskId === task.id) currentTaskId = null;
  });

  child.on("error", error => {
    task.status = "error";
    task.endedAt = new Date().toISOString();
    appendLogLine(task, error.message);
    task.result = { ok: false, code: -1, output: task.logs.join("\n"), source: options.source, localYaml: options.localYaml || null };
    task.child = null;
    if (currentTaskId === task.id) currentTaskId = null;
  });

  return task;
}

function cancelTask(taskId) {
  const task = tasks.get(taskId);
  if (!task) {
    const error = new Error("任务不存在");
    error.statusCode = 404;
    throw error;
  }
  if (!isTaskRunning(task)) {
    const error = new Error("任务已经结束，不能取消");
    error.statusCode = 409;
    throw error;
  }

  task.status = "cancelled";
  task.endedAt = new Date().toISOString();
  appendLogLine(task, `用户取消任务，当前阶段：${task.stageLabel}`);

  if (task.child?.pid) {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(task.child.pid), "/t", "/f"], { stdio: "ignore" });
    } else {
      try {
        process.kill(-task.child.pid, "SIGTERM");
      } catch {
        task.child.kill("SIGTERM");
      }
    }
  }

  if (currentTaskId === task.id) currentTaskId = null;
  return task;
}

async function handleTaskCreation(type, payload) {
  const config = updateConfigFromPayload(payload);
  const noRestart = !!payload.noRestart || config.restartShellCrash === false;

  if (type === "convert") {
    return createTask(type, {
      args: ["--convert-only"],
      noRestart,
      restartShellCrash: config.restartShellCrash
    });
  }

  if (type === "upload") {
    const args = [];
    if (noRestart) args.push("--no-restart");
    return createTask(type, {
      args,
      noRestart,
      restartShellCrash: config.restartShellCrash
    });
  }

  const uploadedYaml = saveUploadedYaml(payload);
  const args = ["--upload-only"];
  if (uploadedYaml) args.push("--local-yaml", uploadedYaml);
  if (noRestart) args.push("--no-restart");
  return createTask(type, {
    args,
    noRestart,
    restartShellCrash: config.restartShellCrash,
    source: uploadedYaml ? "selected-file" : "out-directory",
    localYaml: uploadedYaml
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
        running: isTaskRunning(activeTask())
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

    if (req.method === "POST" && url.pathname === "/api/tasks/convert") {
      const payload = await readBody(req);
      const task = await handleTaskCreation("convert", payload);
      sendJson(res, 202, { ok: true, taskId: task.id });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tasks/upload") {
      const payload = await readBody(req);
      const task = await handleTaskCreation("upload", payload);
      sendJson(res, 202, { ok: true, taskId: task.id });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tasks/upload-yaml") {
      const payload = await readBody(req);
      const task = await handleTaskCreation("upload-yaml", payload);
      sendJson(res, 202, { ok: true, taskId: task.id });
      return;
    }

    if (req.method === "POST" && url.pathname.startsWith("/api/tasks/") && url.pathname.endsWith("/cancel")) {
      const taskId = decodeURIComponent(url.pathname.slice("/api/tasks/".length, -"/cancel".length));
      const task = cancelTask(taskId);
      sendJson(res, 200, { ok: true, task: taskSnapshot(task) });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/tasks/")) {
      const taskId = decodeURIComponent(url.pathname.slice("/api/tasks/".length));
      const task = tasks.get(taskId);
      if (!task) {
        sendJson(res, 404, { ok: false, error: "任务不存在" });
        return;
      }
      sendJson(res, 200, { ok: true, task: taskSnapshot(task) });
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
    const status = error.statusCode || 400;
    sendJson(res, status, { ok: false, error: error.message });
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
