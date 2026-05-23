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

function buildPolishPrompt(text, instruction) {
  if (!text) return instruction;
  return `${instruction}\n\n当前日记内容：\n${text}`;
}

function buildHistoryMessages(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(0, 20)
    .reverse()
    .flatMap((item) => {
      const instruction = String(item?.instruction || "").trim();
      const diaryText = String(item?.diaryText || "").trim();
      const reply = String(item?.reply || "").trim();
      const userContent = diaryText ? `${instruction}\n\n当前日记内容：\n${diaryText}` : instruction;
      const messages = [];
      if (userContent) messages.push({ role: "user", content: userContent });
      if (reply) messages.push({ role: "assistant", content: reply });
      return messages;
    });
}

async function callDeepSeek(text, instruction, history) {
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
      temperature: 0.6,
      messages: [
        ...buildHistoryMessages(history),
        {
          role: "user",
          content: buildPolishPrompt(text, instruction),
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
    throw new Error("DeepSeek 没有返回内容。");
  }
  return result;
}

async function handleDeepSeek(request, response) {
  try {
    const body = await readRequestBody(request);
    const payload = JSON.parse(body || "{}");
    const text = String(payload.text || "").trim();
    const instruction = String(payload.instruction || "").trim();
    const history = Array.isArray(payload.history) ? payload.history : [];
    if (!instruction) {
      sendJson(response, 400, { ok: false, error: "请先对 DeepSeek 说一句话。" });
      return;
    }
    const result = await callDeepSeek(text, instruction, history);
    sendJson(response, 200, { ok: true, text: result, provider: "deepseek" });
  } catch (error) {
    const status = error.code === "NO_DEEPSEEK_KEY" ? 501 : 500;
    sendJson(response, status, { ok: false, error: error.message || "DeepSeek 请求失败了。" });
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
  if (request.method === "POST" && request.url === "/api/deepseek") {
    handleDeepSeek(request, response);
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
