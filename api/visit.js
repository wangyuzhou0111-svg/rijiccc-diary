"use strict";

const VISITOR_SET_KEY = "rijiccc:visitors";
const TOTAL_KEY = "rijiccc:visits:total";

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
      if (body.length > 20_000) {
        reject(new Error("请求内容太长了。"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function getMemoryStore() {
  globalThis.__rijicccVisitStats ||= { total: 0, visitors: new Set() };
  return globalThis.__rijicccVisitStats;
}

async function redisCommand(command) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const response = await fetch(`${url.replace(/\/+$/, "")}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "访问记录数据库暂时不可用。");
  return data.result;
}

async function readStats() {
  const total = await redisCommand(["GET", TOTAL_KEY]);
  const unique = await redisCommand(["SCARD", VISITOR_SET_KEY]);
  if (total !== null && unique !== null) {
    return {
      totalVisits: Number(total || 0),
      uniqueVisitors: Number(unique || 0),
      storage: "upstash",
    };
  }
  const store = getMemoryStore();
  return {
    totalVisits: store.total,
    uniqueVisitors: store.visitors.size,
    storage: "memory",
  };
}

async function recordVisit(visitorId) {
  const cleanVisitorId = String(visitorId || "").trim().slice(0, 120);
  if (!cleanVisitorId) throw new Error("缺少访客编号。");

  const total = await redisCommand(["INCR", TOTAL_KEY]);
  if (total !== null) {
    await redisCommand(["SADD", VISITOR_SET_KEY, cleanVisitorId]);
    return readStats();
  }

  const store = getMemoryStore();
  store.total += 1;
  store.visitors.add(cleanVisitorId);
  return readStats();
}

module.exports = async function handler(request, response) {
  try {
    if (request.method === "GET") {
      sendJson(response, 200, { ok: true, ...(await readStats()) });
      return;
    }
    if (request.method !== "POST") {
      sendJson(response, 405, { ok: false, error: "不支持这个请求。" });
      return;
    }
    const body = await readRequestBody(request);
    const payload = JSON.parse(body || "{}");
    const stats = await recordVisit(payload.visitorId);
    sendJson(response, 200, { ok: true, ...stats });
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error.message || "访问记录失败。" });
  }
};
