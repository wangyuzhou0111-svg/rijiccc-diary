"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = __dirname;
const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 7811);

function loadLocalEnv() {
  const envFiles = [".env.local", ".env"];
  for (const file of envFiles) {
    const fullPath = path.join(ROOT, file);
    if (!fs.existsSync(fullPath)) continue;
    const lines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const equalIndex = trimmed.indexOf("=");
      if (equalIndex === -1) continue;
      const key = trimmed.slice(0, equalIndex).trim();
      const value = trimmed.slice(equalIndex + 1).trim();
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 80_000) {
        reject(new Error("请求内容太长了。"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function buildPolishPrompt(text, mode) {
  const modeNames = {
    smooth: "更通顺",
    child: "保留童真",
    fix: "改错别字",
    fun: "更有趣",
  };
  const modeName = modeNames[mode] || "更通顺";
  return [
    "你是一个温柔的中文日记助手，正在帮助三年级小朋友整理日记。",
    `任务模式：${modeName}`,
    "要求：",
    "1. 保留小朋友原本想表达的意思。",
    "2. 不要编造没有出现的事实。",
    "3. 语言要自然、清楚、适合小学生。",
    "4. 只输出修改后的日记正文，不要解释过程。",
    "5. 如果模式是“保留童真”，不要把文字改得太像大人写的。",
    "",
    "需要润色的日记：",
    text,
  ].join("\n");
}

async function callDeepSeek(text, mode) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    const error = new Error("还没有配置 DeepSeek Token。");
    error.code = "NO_DEEPSEEK_KEY";
    throw error;
  }

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: mode === "fix" ? 0.2 : 0.7,
      messages: [
        {
          role: "system",
          content: "你负责帮助小学生润色中文日记。输出要短、清楚、保留原意。",
        },
        {
          role: "user",
          content: buildPolishPrompt(text, mode),
        },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `DeepSeek 请求失败：${response.status}`;
    throw new Error(message);
  }

  const result = data?.choices?.[0]?.message?.content?.trim();
  if (!result) {
    throw new Error("DeepSeek 没有返回润色文字。");
  }
  return result;
}

async function handlePolish(request, response) {
  try {
    const body = await readRequestBody(request);
    const payload = JSON.parse(body || "{}");
    const text = String(payload.text || "").trim();
    const mode = String(payload.mode || "smooth");
    if (!text) {
      sendJson(response, 400, { ok: false, error: "请先写一点日记，再让 AI 帮忙。" });
      return;
    }
    const result = await callDeepSeek(text, mode);
    sendJson(response, 200, { ok: true, text: result, provider: "deepseek" });
  } catch (error) {
    const status = error.code === "NO_DEEPSEEK_KEY" ? 501 : 500;
    sendJson(response, status, { ok: false, error: error.message || "AI 润色失败了。" });
  }
}

function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://${HOST}:${PORT}`);
  const cleanPath = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
  const target = path.normalize(path.join(ROOT, cleanPath));
  if (!target.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  fs.readFile(target, (error, content) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("没有找到这个文件。");
      return;
    }
    const ext = path.extname(target);
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".md": "text/markdown; charset=utf-8",
      ".txt": "text/plain; charset=utf-8",
    };
    response.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    response.end(content);
  });
}

loadLocalEnv();

const server = http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      ai: "deepseek",
      configured: Boolean(process.env.DEEPSEEK_API_KEY),
    });
    return;
  }
  if (request.method === "POST" && request.url === "/api/polish") {
    handlePolish(request, response);
    return;
  }
  if (request.method === "GET" || request.method === "HEAD") {
    serveStatic(request, response);
    return;
  }
  sendJson(response, 405, { ok: false, error: "不支持这个请求。" });
});

server.listen(PORT, HOST, () => {
  console.log(`日记网站已启动：http://${HOST}:${PORT}/`);
  console.log(`DeepSeek 配置状态：${process.env.DEEPSEEK_API_KEY ? "已配置" : "未配置"}`);
});
