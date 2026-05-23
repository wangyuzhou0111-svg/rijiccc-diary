"use strict";

function sendJson(response, status, data) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
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

function buildPrompt(text, instruction) {
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
          content: buildPrompt(text, instruction),
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

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { ok: false, error: "不支持这个请求。" });
    return;
  }

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
};
