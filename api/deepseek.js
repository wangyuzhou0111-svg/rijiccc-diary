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

const TOOL_MOODS = ["开心", "普通", "难过", "兴奋", "生气", "好奇", "平静", "有点累", "很自豪", "想探索"];
const TOOL_WEATHERS = ["晴天", "阴天", "小雨", "大雨", "下雪", "有风", "很热", "很冷", "多云", "看见星星", "暴风雨", "雷阵雨", "冰雹", "台风", "飓风", "龙卷风", "沙尘暴", "大雾", "海啸", "洪水", "火山爆发", "地震", "极光", "流星雨"];

function buildPrompt(text, instruction) {
  if (!text) return instruction;
  return `${instruction}\n\n当前日记内容：\n${text}`;
}

function buildToolPrompt(text, instruction) {
  return [
    "你是日记网页里的 DeepSeek AI。用户希望你直接写到右边的日记框，并且可以调用网页工具。",
    "只返回 JSON，不要写 Markdown，不要用代码块。",
    "JSON 格式必须是：",
    "{\"reply\":\"给用户看的简短说明\",\"tools\":[{\"name\":\"工具名\",\"value\":\"内容\"}]}",
    "可用工具：",
    "- append_diary：把 value 追加到日记正文后面。",
    "- replace_diary：用 value 替换整篇日记正文。",
    "- tidy_diary：整理当前日记格式，value 可以为空字符串。",
    "- set_title：把标题改成 value。",
    "- set_mood：把心情改成 value，只能使用这些值：" + TOOL_MOODS.join("、"),
    "- set_weather：把天气改成 value，只能使用这些值：" + TOOL_WEATHERS.join("、"),
    "- set_tags：设置标签，value 是字符串数组，比如 [\"学习\",\"开心\"]。",
    "如果用户只是让你写一段内容，优先使用 append_diary。用户明确说重写、替换、改成这样时，才使用 replace_diary。",
    "不要编造用户没有要求的事实。",
    "",
    "用户的话：",
    instruction,
    "",
    "当前日记内容：",
    text || "（现在日记是空的）",
  ].join("\n");
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

async function callDeepSeek(text, instruction, history, mode) {
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
          content: mode === "diary_tools" ? buildToolPrompt(text, instruction) : buildPrompt(text, instruction),
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
    const mode = payload.mode === "diary_tools" ? "diary_tools" : "chat";
    if (!instruction) {
      sendJson(response, 400, { ok: false, error: "请先对 DeepSeek 说一句话。" });
      return;
    }
    const result = await callDeepSeek(text, instruction, history, mode);
    sendJson(response, 200, { ok: true, text: result, provider: "deepseek" });
  } catch (error) {
    const status = error.code === "NO_DEEPSEEK_KEY" ? 501 : 500;
    sendJson(response, status, { ok: false, error: error.message || "DeepSeek 请求失败了。" });
  }
};
