"use strict";
const STORAGE_KEY = "diary-record-app.entries.v1";
const ACTIVE_KEY = "diary-record-app.active-id.v1";
const AUTOSAVE_DELAY = 500;
const moods = ["开心", "普通", "难过", "兴奋", "生气", "好奇", "平静", "有点累", "很自豪", "想探索"];
const weathers = ["晴天", "阴天", "小雨", "大雨", "下雪", "有风", "很热", "很冷", "多云", "看见星星"];
const templates = [
  "今天我最想记录的是：\n\n我看到：\n我想到：\n我学到：",
  "今天让我开心的一件事是：\n\n原因是：\n我还想：",
  "今天我遇到一个问题：\n\n我是这样想的：\n下一步我准备：",
  "今天的学习小结：\n\n新知识：\n还不懂：\n明天继续：",
  "如果今天是一颗行星，它会是：\n\n因为：\n它的颜色：\n它的故事："
];
const helperWords = ["明亮", "安静", "认真", "勇敢", "好奇", "温暖", "清楚", "努力", "惊喜", "进步"];
let entries = [];
let activeId = null;
let saveTimer = null;
let aiSuggestion = "";
let recognition = null;
let aiRecognition = null;
let listening = false;
let aiListening = false;
let hasUnsavedChanges = false;
const $ = (selector) => document.querySelector(selector);
const entryList = $("#entryList");
const editor = $("#editor");
const titleInput = $("#titleInput");
const dateInput = $("#dateInput");
const moodSelect = $("#moodSelect");
const weatherSelect = $("#weatherSelect");
const tagsInput = $("#tagsInput");
const searchInput = $("#searchInput");
const statusText = $("#statusText");
const wordCount = $("#wordCount");
const imageGrid = $("#imageGrid");
const aiPreview = $("#aiPreview");
const aiInstructionInput = $("#aiInstructionInput");
const promptBox = $("#promptBox");
function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function makeId() {
  return `diary-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));
}
function plainTextFromHtml(html) {
  const box = document.createElement("div");
  box.innerHTML = html || "";
  return box.textContent || "";
}
function countWords(text) {
  const cleaned = text.replace(/\s+/g, "").trim();
  return cleaned.length;
}
function normalizeTags(value) {
  return value.split(/[,，\s]+/).map((tag) => tag.trim()).filter(Boolean);
}
function formatDateLabel(dateText) {
  if (!dateText) return "没有日期";
  const parts = dateText.split("-");
  if (parts.length !== 3) return dateText;
  return `${parts[0]}年${Number(parts[1])}月${Number(parts[2])}日`;
}
function setStatus(message) {
  statusText.textContent = message;
}
function markDirty(message = "有新内容，还没有保存。") {
  hasUnsavedChanges = true;
  setStatus(message);
}
function loadEntries() {
  try {
    entries = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (error) {
    entries = [];
    setStatus("读取日记时遇到问题，已经准备一个新的本子。");
  }
  activeId = localStorage.getItem(ACTIVE_KEY);
  if (!entries.length) {
    createEntry(false);
  } else if (!entries.some((entry) => entry.id === activeId)) {
    activeId = entries[0].id;
  }
}
function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
  hasUnsavedChanges = false;
  setStatus("保存好了！");
}
function saveActiveEntry() {
  collectActiveEntry();
  saveEntries();
  renderEntryList();
  renderImages();
  updateCounts();
}
function scheduleSave() {
  clearTimeout(saveTimer);
  hasUnsavedChanges = true;
  setStatus("正在准备自动保存……");
  saveTimer = setTimeout(() => {
    collectActiveEntry();
    saveEntries();
    renderEntryList();
    renderImages();
    updateCounts();
  }, AUTOSAVE_DELAY);
}
function createEntry(shouldRender = true) {
  const now = new Date().toISOString();
  const entry = {
    id: makeId(),
    title: "新的日记",
    date: todayString(),
    mood: moods[0],
    weather: weathers[0],
    tags: [],
    body: "",
    color: "#27324a",
    fontSize: 20,
    images: [],
    versions: [],
    createdAt: now,
    updatedAt: now
  };
  entries.unshift(entry);
  activeId = entry.id;
  saveEntries();
  if (shouldRender) renderAll();
  return entry;
}
function getActiveEntry() {
  return entries.find((entry) => entry.id === activeId) || entries[0];
}
function collectActiveEntry() {
  const entry = getActiveEntry();
  if (!entry) return;
  const previousBody = entry.body || "";
  entry.title = titleInput.value.trim() || "没有标题的日记";
  entry.date = dateInput.value || todayString();
  entry.mood = moodSelect.value;
  entry.weather = weatherSelect.value;
  entry.tags = normalizeTags(tagsInput.value);
  entry.body = editor.innerHTML;
  entry.color = $("#colorInput").value;
  entry.fontSize = Number($("#sizeInput").value);
  entry.updatedAt = new Date().toISOString();
  if (previousBody && previousBody !== entry.body) {
    entry.versions = entry.versions || [];
    entry.versions.push({ body: previousBody, savedAt: entry.updatedAt });
    if (entry.versions.length > 20) entry.versions.shift();
  }
}
function fillSelect(select, values) {
  select.innerHTML = values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
}
function renderEditor() {
  const entry = getActiveEntry();
  if (!entry) return;
  titleInput.value = entry.title || "";
  dateInput.value = entry.date || todayString();
  moodSelect.value = entry.mood || moods[0];
  weatherSelect.value = entry.weather || weathers[0];
  tagsInput.value = (entry.tags || []).join(", ");
  editor.innerHTML = entry.body || "";
  editor.style.color = entry.color || "#27324a";
  editor.style.fontSize = `${entry.fontSize || 20}px`;
  $("#colorInput").value = entry.color || "#27324a";
  $("#sizeInput").value = entry.fontSize || 20;
  updateCounts();
  renderImages();
}
function renderEntryList() {
  const query = searchInput.value.trim().toLowerCase();
  const visible = entries.filter((entry) => {
    const text = `${entry.title} ${plainTextFromHtml(entry.body)} ${(entry.tags || []).join(" ")}`.toLowerCase();
    return !query || text.includes(query);
  });
  $("#entryCountBadge").textContent = `${visible.length} 篇`;
  entryList.innerHTML = visible.map((entry) => {
    const activeClass = entry.id === activeId ? " active" : "";
    const text = plainTextFromHtml(entry.body).slice(0, 46) || "还没有正文";
    return `<button class="entry-card${activeClass}" data-id="${entry.id}" type="button"><span class="directory-line"><strong>${escapeHtml(entry.title || "没有标题")}</strong><em class="saved-mark">已保存</em></span><span>${formatDateLabel(entry.date)} · ${escapeHtml(entry.mood || "心情")}</span><span>${escapeHtml(text)}</span></button>`;
  }).join("");
}
function renderImages() {
  const entry = getActiveEntry();
  const images = entry?.images || [];
  $("#imageCountBadge").textContent = `${images.length} 张`;
  imageGrid.innerHTML = images.map((image, index) => `<article class="image-card"><img src="${image.src}" alt="日记图片 ${index + 1}"><textarea data-image-note="${index}" placeholder="给图片写一句说明">${escapeHtml(image.note || "")}</textarea><button data-delete-image="${index}" class="tiny-button" type="button">删除图片</button></article>`).join("");
}
function updateCounts() {
  const entry = getActiveEntry();
  const text = plainTextFromHtml(editor.innerHTML);
  const words = countWords(text);
  const tags = normalizeTags(tagsInput.value);
  wordCount.textContent = `${words} 字`;
  $("#statWords").textContent = words;
  $("#statImages").textContent = entry?.images?.length || 0;
  $("#statTags").textContent = tags.length;
  $("#statVersions").textContent = entry?.versions?.length || 0;
}
function renderPrompt() {
  const item = diaryWritingPromptBank[Math.floor(Math.random() * diaryWritingPromptBank.length)];
  promptBox.innerHTML = `<strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.question)}</p>`;
}
function renderTemplates() {
  $("#templateList").innerHTML = templates.map((template, index) => `<button class="soft-button template-button" data-template="${index}" type="button">${escapeHtml(template.split("\n")[0])}</button>`).join("");
}
function renderAll() {
  renderEntryList();
  renderEditor();
}
function applyCommand(command) {
  editor.focus();
  document.execCommand(command, false, null);
  scheduleSave();
}
function insertTextAtEnd(text) {
  editor.focus();
  const safe = escapeHtml(text).replace(/\n/g, "<br>");
  editor.innerHTML = `${editor.innerHTML}<p>${safe}</p>`;
  scheduleSave();
  updateCounts();
}
function tidyText() {
  const text = plainTextFromHtml(editor.innerHTML).split("\n").map((line) => line.trim()).filter(Boolean).join("\n\n");
  editor.innerHTML = text.split("\n\n").map((part) => `<p>${escapeHtml(part)}</p>`).join("");
  scheduleSave();
}
async function requestAiPolish() {
  const text = plainTextFromHtml(editor.innerHTML).trim();
  const instruction = aiInstructionInput.value.trim();
  if (!text) {
    aiSuggestion = "";
    aiPreview.textContent = "先写一点日记，再让 DeepSeek 帮忙。";
    return;
  }
  if (!instruction) {
    aiSuggestion = "";
    aiPreview.textContent = "请先打字，或者用语音告诉 DeepSeek 你想怎么改。";
    return;
  }

  aiPreview.textContent = "DeepSeek 正在帮你润色，请稍等……";
  setStatus("正在请求 DeepSeek 润色……");

  try {
    const response = await fetch("/api/polish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, instruction }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "DeepSeek 润色失败。");
    }
    aiSuggestion = data.text;
    aiPreview.textContent = aiSuggestion;
    setStatus("DeepSeek 已经给出建议，喜欢的话可以点“接受建议”。");
  } catch (error) {
    aiSuggestion = "";
    aiPreview.textContent = error.message || "DeepSeek 润色失败了。";
    setStatus("DeepSeek 没有成功返回，请检查服务或 Token。");
  }
}
function exportFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  setStatus("导出好了！");
}
function exportMarkdown() {
  collectActiveEntry();
  const entry = getActiveEntry();
  const lines = [];
  lines.push(`# ${entry.title}`);
  lines.push("");
  lines.push(`日期：${entry.date}`);
  lines.push(`心情：${entry.mood}`);
  lines.push(`天气：${entry.weather}`);
  lines.push(`标签：${(entry.tags || []).join(", ")}`);
  lines.push("");
  lines.push(plainTextFromHtml(entry.body));
  lines.push("");
  (entry.images || []).forEach((image, index) => lines.push(`图片 ${index + 1}：${image.note || "没有说明"}`));
  exportFile(`${entry.date}-${entry.title}.md`, lines.join("\n"), "text/markdown;charset=utf-8");
}
function exportJson() {
  collectActiveEntry();
  const entry = getActiveEntry();
  exportFile(`${entry.date}-${entry.title}.json`, JSON.stringify(entry, null, 2), "application/json;charset=utf-8");
}
function setupVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;
  recognition = new SpeechRecognition();
  recognition.lang = "zh-CN";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.onresult = (event) => {
    const text = Array.from(event.results).map((result) => result[0].transcript).join(" ");
    insertTextAtEnd(text);
    setStatus("语音已经写进日记里了。");
  };
  recognition.onend = () => {
    listening = false;
    $("#voiceBtn").classList.remove("is-listening");
  };
  recognition.onerror = () => setStatus("这次没有听清楚，可以再试一次。");

  aiRecognition = new SpeechRecognition();
  aiRecognition.lang = "zh-CN";
  aiRecognition.continuous = false;
  aiRecognition.interimResults = false;
  aiRecognition.onresult = (event) => {
    const text = Array.from(event.results).map((result) => result[0].transcript).join(" ");
    aiInstructionInput.value = `${aiInstructionInput.value} ${text}`.trim();
    setStatus("已经把语音要求写进 AI 输入框。");
  };
  aiRecognition.onend = () => {
    aiListening = false;
    $("#aiVoiceBtn").classList.remove("is-listening");
    aiInstructionInput.classList.remove("is-listening");
  };
  aiRecognition.onerror = () => setStatus("这次没有听清楚 AI 要求，可以再试一次。");
}
function toggleVoice() {
  if (!recognition) {
    setStatus("这个浏览器暂时不支持语音输入，可以先用打字。");
    return;
  }
  if (listening) {
    recognition.stop();
    return;
  }
  listening = true;
  $("#voiceBtn").classList.add("is-listening");
  setStatus("正在听你说话……");
  recognition.start();
}
function toggleAiVoice() {
  if (!aiRecognition) {
    setStatus("这个浏览器暂时不支持语音告诉 AI，可以先打字。");
    return;
  }
  if (aiListening) {
    aiRecognition.stop();
    return;
  }
  aiListening = true;
  $("#aiVoiceBtn").classList.add("is-listening");
  aiInstructionInput.classList.add("is-listening");
  setStatus("正在听你对 AI 说要求……");
  aiRecognition.start();
}
function handleImages(files) {
  const entry = getActiveEntry();
  Array.from(files).forEach((file) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 2 * 1024 * 1024) {
      setStatus("图片有点大，请换一张小一点的试试。");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      entry.images.push({ src: reader.result, note: "" });
      saveEntries();
      renderImages();
      updateCounts();
    };
    reader.readAsDataURL(file);
  });
}
function exitApp() {
  const shouldSave = window.confirm("退出前要保存这篇日记吗？");
  if (shouldSave) {
    saveActiveEntry();
  }
  setStatus("已经处理退出请求。这个本地网页可以直接关闭标签页。");
  window.close();
}
function bindEvents() {
  $("#addEntryBtn").addEventListener("click", () => createEntry(true));
  $("#newEntryBtn").addEventListener("click", () => createEntry(true));
  $("#saveEntryBtn").addEventListener("click", saveActiveEntry);
  $("#exitBtn").addEventListener("click", exitApp);
  $("#exportMarkdownBtn").addEventListener("click", exportMarkdown);
  $("#exportJsonBtn").addEventListener("click", exportJson);
  $("#todayBtn").addEventListener("click", () => { dateInput.value = todayString(); scheduleSave(); });
  $("#clearSearchBtn").addEventListener("click", () => { searchInput.value = ""; renderEntryList(); });
  searchInput.addEventListener("input", renderEntryList);
  [titleInput, dateInput, moodSelect, weatherSelect, tagsInput].forEach((node) => node.addEventListener("input", scheduleSave));
  editor.addEventListener("input", () => { updateCounts(); scheduleSave(); });
  $("#colorInput").addEventListener("input", (event) => { editor.style.color = event.target.value; scheduleSave(); });
  $("#sizeInput").addEventListener("input", (event) => { editor.style.fontSize = `${event.target.value}px`; scheduleSave(); });
  document.querySelectorAll("[data-command]").forEach((button) => button.addEventListener("click", () => applyCommand(button.dataset.command)));
  $("#listBtn").addEventListener("click", () => applyCommand("insertUnorderedList"));
  $("#quoteBtn").addEventListener("click", () => insertTextAtEnd("“把想法写下来，它就变得更清楚了。”"));
  $("#tidyBtn").addEventListener("click", tidyText);
  $("#voiceBtn").addEventListener("click", toggleVoice);
  $("#imageInput").addEventListener("change", (event) => handleImages(event.target.files));
  entryList.addEventListener("click", (event) => {
    const card = event.target.closest(".entry-card");
    if (!card) return;
    collectActiveEntry();
    activeId = card.dataset.id;
    saveEntries();
    renderAll();
  });
  imageGrid.addEventListener("input", (event) => {
    if (!event.target.matches("[data-image-note]")) return;
    const entry = getActiveEntry();
    entry.images[Number(event.target.dataset.imageNote)].note = event.target.value;
    scheduleSave();
  });
  imageGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-image]");
    if (!button) return;
    const entry = getActiveEntry();
    entry.images.splice(Number(button.dataset.deleteImage), 1);
    saveEntries();
    renderImages();
    updateCounts();
  });
  $("#sendAiBtn").addEventListener("click", requestAiPolish);
  $("#aiVoiceBtn").addEventListener("click", toggleAiVoice);
  $("#acceptAiBtn").addEventListener("click", () => {
    if (!aiSuggestion) return;
    editor.innerHTML = aiSuggestion.split("\n").map((line) => `<p>${escapeHtml(line)}</p>`).join("");
    aiSuggestion = "";
    aiPreview.textContent = "已经接受建议。";
    scheduleSave();
    updateCounts();
  });
  $("#clearAiBtn").addEventListener("click", () => { aiSuggestion = ""; aiPreview.textContent = "已经不要这次建议。"; });
  $("#randomPromptBtn").addEventListener("click", renderPrompt);
  $("#templateList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-template]");
    if (!button) return;
    insertTextAtEnd(templates[Number(button.dataset.template)]);
  });
  window.addEventListener("keydown", (event) => {
    const isSaveShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s";
    if (!isSaveShortcut) return;
    event.preventDefault();
    saveActiveEntry();
  });
  window.addEventListener("beforeunload", (event) => {
    if (!hasUnsavedChanges) return;
    event.preventDefault();
    event.returnValue = "还有没保存的日记，确定要退出吗？";
  });
}
function boot() {
  fillSelect(moodSelect, moods);
  fillSelect(weatherSelect, weathers);
  loadEntries();
  renderTemplates();
  renderPrompt();
  setupVoice();
  bindEvents();
  renderAll();
  setStatus("准备好了，可以开始写日记。");
}
const diaryWritingPromptBank = Object.freeze([
  { id: "prompt-001", title: "写作提示 001", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-002", title: "写作提示 002", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-003", title: "写作提示 003", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-004", title: "写作提示 004", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-005", title: "写作提示 005", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-006", title: "写作提示 006", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-007", title: "写作提示 007", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-008", title: "写作提示 008", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-009", title: "写作提示 009", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-010", title: "写作提示 010", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-011", title: "写作提示 011", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-012", title: "写作提示 012", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-013", title: "写作提示 013", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-014", title: "写作提示 014", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-015", title: "写作提示 015", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-016", title: "写作提示 016", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-017", title: "写作提示 017", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-018", title: "写作提示 018", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-019", title: "写作提示 019", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-020", title: "写作提示 020", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-021", title: "写作提示 021", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-022", title: "写作提示 022", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-023", title: "写作提示 023", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-024", title: "写作提示 024", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-025", title: "写作提示 025", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-026", title: "写作提示 026", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-027", title: "写作提示 027", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-028", title: "写作提示 028", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-029", title: "写作提示 029", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-030", title: "写作提示 030", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-031", title: "写作提示 031", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-032", title: "写作提示 032", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-033", title: "写作提示 033", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-034", title: "写作提示 034", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-035", title: "写作提示 035", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-036", title: "写作提示 036", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-037", title: "写作提示 037", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-038", title: "写作提示 038", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-039", title: "写作提示 039", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-040", title: "写作提示 040", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-041", title: "写作提示 041", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-042", title: "写作提示 042", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-043", title: "写作提示 043", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-044", title: "写作提示 044", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-045", title: "写作提示 045", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-046", title: "写作提示 046", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-047", title: "写作提示 047", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-048", title: "写作提示 048", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-049", title: "写作提示 049", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-050", title: "写作提示 050", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-051", title: "写作提示 051", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-052", title: "写作提示 052", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-053", title: "写作提示 053", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-054", title: "写作提示 054", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-055", title: "写作提示 055", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-056", title: "写作提示 056", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-057", title: "写作提示 057", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-058", title: "写作提示 058", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-059", title: "写作提示 059", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-060", title: "写作提示 060", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-061", title: "写作提示 061", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-062", title: "写作提示 062", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-063", title: "写作提示 063", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-064", title: "写作提示 064", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-065", title: "写作提示 065", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-066", title: "写作提示 066", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-067", title: "写作提示 067", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-068", title: "写作提示 068", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-069", title: "写作提示 069", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-070", title: "写作提示 070", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-071", title: "写作提示 071", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-072", title: "写作提示 072", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-073", title: "写作提示 073", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-074", title: "写作提示 074", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-075", title: "写作提示 075", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-076", title: "写作提示 076", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-077", title: "写作提示 077", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-078", title: "写作提示 078", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-079", title: "写作提示 079", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-080", title: "写作提示 080", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-081", title: "写作提示 081", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-082", title: "写作提示 082", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-083", title: "写作提示 083", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-084", title: "写作提示 084", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-085", title: "写作提示 085", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-086", title: "写作提示 086", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-087", title: "写作提示 087", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-088", title: "写作提示 088", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-089", title: "写作提示 089", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-090", title: "写作提示 090", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-091", title: "写作提示 091", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-092", title: "写作提示 092", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-093", title: "写作提示 093", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-094", title: "写作提示 094", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-095", title: "写作提示 095", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-096", title: "写作提示 096", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-097", title: "写作提示 097", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-098", title: "写作提示 098", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-099", title: "写作提示 099", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-100", title: "写作提示 100", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-101", title: "写作提示 101", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-102", title: "写作提示 102", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-103", title: "写作提示 103", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-104", title: "写作提示 104", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-105", title: "写作提示 105", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-106", title: "写作提示 106", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-107", title: "写作提示 107", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-108", title: "写作提示 108", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-109", title: "写作提示 109", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-110", title: "写作提示 110", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-111", title: "写作提示 111", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-112", title: "写作提示 112", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-113", title: "写作提示 113", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-114", title: "写作提示 114", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-115", title: "写作提示 115", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-116", title: "写作提示 116", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-117", title: "写作提示 117", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-118", title: "写作提示 118", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-119", title: "写作提示 119", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-120", title: "写作提示 120", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-121", title: "写作提示 121", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-122", title: "写作提示 122", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-123", title: "写作提示 123", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-124", title: "写作提示 124", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-125", title: "写作提示 125", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-126", title: "写作提示 126", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-127", title: "写作提示 127", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-128", title: "写作提示 128", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-129", title: "写作提示 129", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-130", title: "写作提示 130", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-131", title: "写作提示 131", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-132", title: "写作提示 132", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-133", title: "写作提示 133", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-134", title: "写作提示 134", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-135", title: "写作提示 135", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-136", title: "写作提示 136", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-137", title: "写作提示 137", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-138", title: "写作提示 138", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-139", title: "写作提示 139", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-140", title: "写作提示 140", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-141", title: "写作提示 141", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-142", title: "写作提示 142", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-143", title: "写作提示 143", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-144", title: "写作提示 144", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-145", title: "写作提示 145", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-146", title: "写作提示 146", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-147", title: "写作提示 147", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-148", title: "写作提示 148", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-149", title: "写作提示 149", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-150", title: "写作提示 150", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-151", title: "写作提示 151", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-152", title: "写作提示 152", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-153", title: "写作提示 153", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-154", title: "写作提示 154", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-155", title: "写作提示 155", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-156", title: "写作提示 156", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-157", title: "写作提示 157", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-158", title: "写作提示 158", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-159", title: "写作提示 159", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-160", title: "写作提示 160", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-161", title: "写作提示 161", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-162", title: "写作提示 162", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-163", title: "写作提示 163", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-164", title: "写作提示 164", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-165", title: "写作提示 165", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-166", title: "写作提示 166", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-167", title: "写作提示 167", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-168", title: "写作提示 168", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-169", title: "写作提示 169", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-170", title: "写作提示 170", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-171", title: "写作提示 171", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-172", title: "写作提示 172", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-173", title: "写作提示 173", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-174", title: "写作提示 174", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-175", title: "写作提示 175", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-176", title: "写作提示 176", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-177", title: "写作提示 177", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-178", title: "写作提示 178", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-179", title: "写作提示 179", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-180", title: "写作提示 180", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-181", title: "写作提示 181", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-182", title: "写作提示 182", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-183", title: "写作提示 183", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-184", title: "写作提示 184", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-185", title: "写作提示 185", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-186", title: "写作提示 186", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-187", title: "写作提示 187", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-188", title: "写作提示 188", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-189", title: "写作提示 189", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-190", title: "写作提示 190", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-191", title: "写作提示 191", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-192", title: "写作提示 192", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-193", title: "写作提示 193", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-194", title: "写作提示 194", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-195", title: "写作提示 195", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-196", title: "写作提示 196", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-197", title: "写作提示 197", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-198", title: "写作提示 198", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-199", title: "写作提示 199", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-200", title: "写作提示 200", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-201", title: "写作提示 201", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-202", title: "写作提示 202", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-203", title: "写作提示 203", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-204", title: "写作提示 204", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-205", title: "写作提示 205", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-206", title: "写作提示 206", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-207", title: "写作提示 207", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-208", title: "写作提示 208", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-209", title: "写作提示 209", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-210", title: "写作提示 210", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-211", title: "写作提示 211", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-212", title: "写作提示 212", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-213", title: "写作提示 213", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-214", title: "写作提示 214", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-215", title: "写作提示 215", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-216", title: "写作提示 216", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-217", title: "写作提示 217", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-218", title: "写作提示 218", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-219", title: "写作提示 219", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-220", title: "写作提示 220", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-221", title: "写作提示 221", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-222", title: "写作提示 222", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-223", title: "写作提示 223", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-224", title: "写作提示 224", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-225", title: "写作提示 225", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-226", title: "写作提示 226", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-227", title: "写作提示 227", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-228", title: "写作提示 228", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-229", title: "写作提示 229", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-230", title: "写作提示 230", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-231", title: "写作提示 231", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-232", title: "写作提示 232", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-233", title: "写作提示 233", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-234", title: "写作提示 234", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-235", title: "写作提示 235", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-236", title: "写作提示 236", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-237", title: "写作提示 237", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-238", title: "写作提示 238", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-239", title: "写作提示 239", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-240", title: "写作提示 240", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-241", title: "写作提示 241", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-242", title: "写作提示 242", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-243", title: "写作提示 243", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-244", title: "写作提示 244", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-245", title: "写作提示 245", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-246", title: "写作提示 246", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-247", title: "写作提示 247", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-248", title: "写作提示 248", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-249", title: "写作提示 249", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-250", title: "写作提示 250", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-251", title: "写作提示 251", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-252", title: "写作提示 252", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-253", title: "写作提示 253", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-254", title: "写作提示 254", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-255", title: "写作提示 255", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-256", title: "写作提示 256", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-257", title: "写作提示 257", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-258", title: "写作提示 258", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-259", title: "写作提示 259", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-260", title: "写作提示 260", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-261", title: "写作提示 261", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-262", title: "写作提示 262", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-263", title: "写作提示 263", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-264", title: "写作提示 264", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-265", title: "写作提示 265", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-266", title: "写作提示 266", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-267", title: "写作提示 267", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-268", title: "写作提示 268", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-269", title: "写作提示 269", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-270", title: "写作提示 270", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-271", title: "写作提示 271", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-272", title: "写作提示 272", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-273", title: "写作提示 273", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-274", title: "写作提示 274", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-275", title: "写作提示 275", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-276", title: "写作提示 276", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-277", title: "写作提示 277", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-278", title: "写作提示 278", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-279", title: "写作提示 279", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-280", title: "写作提示 280", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-281", title: "写作提示 281", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-282", title: "写作提示 282", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-283", title: "写作提示 283", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-284", title: "写作提示 284", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-285", title: "写作提示 285", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-286", title: "写作提示 286", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-287", title: "写作提示 287", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-288", title: "写作提示 288", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-289", title: "写作提示 289", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-290", title: "写作提示 290", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-291", title: "写作提示 291", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-292", title: "写作提示 292", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-293", title: "写作提示 293", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-294", title: "写作提示 294", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-295", title: "写作提示 295", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-296", title: "写作提示 296", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-297", title: "写作提示 297", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-298", title: "写作提示 298", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-299", title: "写作提示 299", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-300", title: "写作提示 300", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-301", title: "写作提示 301", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-302", title: "写作提示 302", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-303", title: "写作提示 303", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-304", title: "写作提示 304", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-305", title: "写作提示 305", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-306", title: "写作提示 306", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-307", title: "写作提示 307", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-308", title: "写作提示 308", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-309", title: "写作提示 309", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-310", title: "写作提示 310", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-311", title: "写作提示 311", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-312", title: "写作提示 312", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-313", title: "写作提示 313", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-314", title: "写作提示 314", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-315", title: "写作提示 315", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-316", title: "写作提示 316", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-317", title: "写作提示 317", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-318", title: "写作提示 318", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-319", title: "写作提示 319", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-320", title: "写作提示 320", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-321", title: "写作提示 321", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-322", title: "写作提示 322", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-323", title: "写作提示 323", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-324", title: "写作提示 324", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-325", title: "写作提示 325", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-326", title: "写作提示 326", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-327", title: "写作提示 327", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-328", title: "写作提示 328", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-329", title: "写作提示 329", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-330", title: "写作提示 330", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-331", title: "写作提示 331", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-332", title: "写作提示 332", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-333", title: "写作提示 333", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-334", title: "写作提示 334", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-335", title: "写作提示 335", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-336", title: "写作提示 336", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-337", title: "写作提示 337", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-338", title: "写作提示 338", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-339", title: "写作提示 339", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-340", title: "写作提示 340", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-341", title: "写作提示 341", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-342", title: "写作提示 342", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-343", title: "写作提示 343", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-344", title: "写作提示 344", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-345", title: "写作提示 345", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-346", title: "写作提示 346", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-347", title: "写作提示 347", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-348", title: "写作提示 348", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-349", title: "写作提示 349", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-350", title: "写作提示 350", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-351", title: "写作提示 351", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-352", title: "写作提示 352", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-353", title: "写作提示 353", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-354", title: "写作提示 354", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-355", title: "写作提示 355", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-356", title: "写作提示 356", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-357", title: "写作提示 357", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-358", title: "写作提示 358", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-359", title: "写作提示 359", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-360", title: "写作提示 360", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-361", title: "写作提示 361", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-362", title: "写作提示 362", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-363", title: "写作提示 363", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-364", title: "写作提示 364", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-365", title: "写作提示 365", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-366", title: "写作提示 366", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-367", title: "写作提示 367", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-368", title: "写作提示 368", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-369", title: "写作提示 369", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-370", title: "写作提示 370", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-371", title: "写作提示 371", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-372", title: "写作提示 372", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-373", title: "写作提示 373", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-374", title: "写作提示 374", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-375", title: "写作提示 375", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-376", title: "写作提示 376", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-377", title: "写作提示 377", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-378", title: "写作提示 378", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-379", title: "写作提示 379", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-380", title: "写作提示 380", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-381", title: "写作提示 381", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-382", title: "写作提示 382", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-383", title: "写作提示 383", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-384", title: "写作提示 384", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-385", title: "写作提示 385", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-386", title: "写作提示 386", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-387", title: "写作提示 387", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-388", title: "写作提示 388", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-389", title: "写作提示 389", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-390", title: "写作提示 390", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-391", title: "写作提示 391", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-392", title: "写作提示 392", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-393", title: "写作提示 393", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-394", title: "写作提示 394", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-395", title: "写作提示 395", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-396", title: "写作提示 396", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-397", title: "写作提示 397", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-398", title: "写作提示 398", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-399", title: "写作提示 399", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-400", title: "写作提示 400", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-401", title: "写作提示 401", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-402", title: "写作提示 402", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-403", title: "写作提示 403", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-404", title: "写作提示 404", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-405", title: "写作提示 405", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-406", title: "写作提示 406", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-407", title: "写作提示 407", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-408", title: "写作提示 408", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-409", title: "写作提示 409", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-410", title: "写作提示 410", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-411", title: "写作提示 411", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-412", title: "写作提示 412", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-413", title: "写作提示 413", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-414", title: "写作提示 414", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-415", title: "写作提示 415", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-416", title: "写作提示 416", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-417", title: "写作提示 417", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-418", title: "写作提示 418", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-419", title: "写作提示 419", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-420", title: "写作提示 420", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-421", title: "写作提示 421", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-422", title: "写作提示 422", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-423", title: "写作提示 423", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-424", title: "写作提示 424", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-425", title: "写作提示 425", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-426", title: "写作提示 426", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-427", title: "写作提示 427", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-428", title: "写作提示 428", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-429", title: "写作提示 429", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-430", title: "写作提示 430", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-431", title: "写作提示 431", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-432", title: "写作提示 432", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-433", title: "写作提示 433", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-434", title: "写作提示 434", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-435", title: "写作提示 435", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-436", title: "写作提示 436", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-437", title: "写作提示 437", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-438", title: "写作提示 438", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-439", title: "写作提示 439", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-440", title: "写作提示 440", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-441", title: "写作提示 441", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-442", title: "写作提示 442", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-443", title: "写作提示 443", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-444", title: "写作提示 444", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-445", title: "写作提示 445", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-446", title: "写作提示 446", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-447", title: "写作提示 447", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-448", title: "写作提示 448", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-449", title: "写作提示 449", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-450", title: "写作提示 450", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-451", title: "写作提示 451", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-452", title: "写作提示 452", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-453", title: "写作提示 453", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-454", title: "写作提示 454", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-455", title: "写作提示 455", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-456", title: "写作提示 456", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-457", title: "写作提示 457", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-458", title: "写作提示 458", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-459", title: "写作提示 459", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-460", title: "写作提示 460", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-461", title: "写作提示 461", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-462", title: "写作提示 462", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-463", title: "写作提示 463", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-464", title: "写作提示 464", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-465", title: "写作提示 465", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-466", title: "写作提示 466", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-467", title: "写作提示 467", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-468", title: "写作提示 468", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-469", title: "写作提示 469", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-470", title: "写作提示 470", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-471", title: "写作提示 471", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-472", title: "写作提示 472", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-473", title: "写作提示 473", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-474", title: "写作提示 474", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-475", title: "写作提示 475", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-476", title: "写作提示 476", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-477", title: "写作提示 477", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-478", title: "写作提示 478", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-479", title: "写作提示 479", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-480", title: "写作提示 480", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-481", title: "写作提示 481", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-482", title: "写作提示 482", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-483", title: "写作提示 483", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-484", title: "写作提示 484", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-485", title: "写作提示 485", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-486", title: "写作提示 486", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-487", title: "写作提示 487", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-488", title: "写作提示 488", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-489", title: "写作提示 489", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-490", title: "写作提示 490", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-491", title: "写作提示 491", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-492", title: "写作提示 492", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-493", title: "写作提示 493", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-494", title: "写作提示 494", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-495", title: "写作提示 495", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-496", title: "写作提示 496", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-497", title: "写作提示 497", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-498", title: "写作提示 498", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-499", title: "写作提示 499", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-500", title: "写作提示 500", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-501", title: "写作提示 501", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-502", title: "写作提示 502", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-503", title: "写作提示 503", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-504", title: "写作提示 504", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-505", title: "写作提示 505", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-506", title: "写作提示 506", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-507", title: "写作提示 507", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-508", title: "写作提示 508", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-509", title: "写作提示 509", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-510", title: "写作提示 510", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-511", title: "写作提示 511", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-512", title: "写作提示 512", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-513", title: "写作提示 513", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-514", title: "写作提示 514", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-515", title: "写作提示 515", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-516", title: "写作提示 516", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-517", title: "写作提示 517", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-518", title: "写作提示 518", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-519", title: "写作提示 519", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-520", title: "写作提示 520", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-521", title: "写作提示 521", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-522", title: "写作提示 522", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-523", title: "写作提示 523", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-524", title: "写作提示 524", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-525", title: "写作提示 525", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-526", title: "写作提示 526", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-527", title: "写作提示 527", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-528", title: "写作提示 528", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-529", title: "写作提示 529", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-530", title: "写作提示 530", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-531", title: "写作提示 531", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-532", title: "写作提示 532", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-533", title: "写作提示 533", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-534", title: "写作提示 534", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-535", title: "写作提示 535", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-536", title: "写作提示 536", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-537", title: "写作提示 537", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-538", title: "写作提示 538", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-539", title: "写作提示 539", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-540", title: "写作提示 540", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-541", title: "写作提示 541", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-542", title: "写作提示 542", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-543", title: "写作提示 543", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-544", title: "写作提示 544", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-545", title: "写作提示 545", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-546", title: "写作提示 546", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-547", title: "写作提示 547", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-548", title: "写作提示 548", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-549", title: "写作提示 549", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-550", title: "写作提示 550", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-551", title: "写作提示 551", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-552", title: "写作提示 552", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-553", title: "写作提示 553", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-554", title: "写作提示 554", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-555", title: "写作提示 555", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-556", title: "写作提示 556", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-557", title: "写作提示 557", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-558", title: "写作提示 558", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-559", title: "写作提示 559", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-560", title: "写作提示 560", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-561", title: "写作提示 561", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-562", title: "写作提示 562", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-563", title: "写作提示 563", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-564", title: "写作提示 564", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-565", title: "写作提示 565", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-566", title: "写作提示 566", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-567", title: "写作提示 567", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-568", title: "写作提示 568", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-569", title: "写作提示 569", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-570", title: "写作提示 570", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-571", title: "写作提示 571", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-572", title: "写作提示 572", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-573", title: "写作提示 573", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-574", title: "写作提示 574", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-575", title: "写作提示 575", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-576", title: "写作提示 576", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-577", title: "写作提示 577", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-578", title: "写作提示 578", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-579", title: "写作提示 579", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-580", title: "写作提示 580", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-581", title: "写作提示 581", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-582", title: "写作提示 582", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-583", title: "写作提示 583", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-584", title: "写作提示 584", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-585", title: "写作提示 585", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-586", title: "写作提示 586", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-587", title: "写作提示 587", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-588", title: "写作提示 588", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-589", title: "写作提示 589", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-590", title: "写作提示 590", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-591", title: "写作提示 591", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-592", title: "写作提示 592", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-593", title: "写作提示 593", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-594", title: "写作提示 594", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-595", title: "写作提示 595", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-596", title: "写作提示 596", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-597", title: "写作提示 597", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-598", title: "写作提示 598", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-599", title: "写作提示 599", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-600", title: "写作提示 600", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-601", title: "写作提示 601", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-602", title: "写作提示 602", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-603", title: "写作提示 603", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-604", title: "写作提示 604", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-605", title: "写作提示 605", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-606", title: "写作提示 606", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-607", title: "写作提示 607", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-608", title: "写作提示 608", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-609", title: "写作提示 609", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-610", title: "写作提示 610", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-611", title: "写作提示 611", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-612", title: "写作提示 612", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-613", title: "写作提示 613", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-614", title: "写作提示 614", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-615", title: "写作提示 615", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-616", title: "写作提示 616", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-617", title: "写作提示 617", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-618", title: "写作提示 618", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-619", title: "写作提示 619", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-620", title: "写作提示 620", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-621", title: "写作提示 621", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-622", title: "写作提示 622", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-623", title: "写作提示 623", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-624", title: "写作提示 624", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-625", title: "写作提示 625", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-626", title: "写作提示 626", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-627", title: "写作提示 627", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-628", title: "写作提示 628", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-629", title: "写作提示 629", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-630", title: "写作提示 630", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-631", title: "写作提示 631", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-632", title: "写作提示 632", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-633", title: "写作提示 633", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-634", title: "写作提示 634", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-635", title: "写作提示 635", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-636", title: "写作提示 636", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-637", title: "写作提示 637", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-638", title: "写作提示 638", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-639", title: "写作提示 639", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-640", title: "写作提示 640", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-641", title: "写作提示 641", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-642", title: "写作提示 642", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-643", title: "写作提示 643", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-644", title: "写作提示 644", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-645", title: "写作提示 645", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-646", title: "写作提示 646", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-647", title: "写作提示 647", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-648", title: "写作提示 648", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-649", title: "写作提示 649", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-650", title: "写作提示 650", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-651", title: "写作提示 651", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-652", title: "写作提示 652", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-653", title: "写作提示 653", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-654", title: "写作提示 654", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-655", title: "写作提示 655", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-656", title: "写作提示 656", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-657", title: "写作提示 657", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-658", title: "写作提示 658", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-659", title: "写作提示 659", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-660", title: "写作提示 660", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-661", title: "写作提示 661", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-662", title: "写作提示 662", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-663", title: "写作提示 663", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-664", title: "写作提示 664", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-665", title: "写作提示 665", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-666", title: "写作提示 666", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-667", title: "写作提示 667", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-668", title: "写作提示 668", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-669", title: "写作提示 669", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-670", title: "写作提示 670", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-671", title: "写作提示 671", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-672", title: "写作提示 672", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-673", title: "写作提示 673", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-674", title: "写作提示 674", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-675", title: "写作提示 675", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-676", title: "写作提示 676", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-677", title: "写作提示 677", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-678", title: "写作提示 678", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-679", title: "写作提示 679", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-680", title: "写作提示 680", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-681", title: "写作提示 681", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-682", title: "写作提示 682", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-683", title: "写作提示 683", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-684", title: "写作提示 684", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-685", title: "写作提示 685", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-686", title: "写作提示 686", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-687", title: "写作提示 687", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-688", title: "写作提示 688", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-689", title: "写作提示 689", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-690", title: "写作提示 690", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-691", title: "写作提示 691", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-692", title: "写作提示 692", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-693", title: "写作提示 693", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-694", title: "写作提示 694", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-695", title: "写作提示 695", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-696", title: "写作提示 696", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-697", title: "写作提示 697", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-698", title: "写作提示 698", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-699", title: "写作提示 699", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-700", title: "写作提示 700", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-701", title: "写作提示 701", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-702", title: "写作提示 702", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-703", title: "写作提示 703", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-704", title: "写作提示 704", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-705", title: "写作提示 705", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-706", title: "写作提示 706", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-707", title: "写作提示 707", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-708", title: "写作提示 708", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-709", title: "写作提示 709", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-710", title: "写作提示 710", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-711", title: "写作提示 711", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-712", title: "写作提示 712", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-713", title: "写作提示 713", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-714", title: "写作提示 714", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-715", title: "写作提示 715", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-716", title: "写作提示 716", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-717", title: "写作提示 717", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-718", title: "写作提示 718", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-719", title: "写作提示 719", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-720", title: "写作提示 720", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-721", title: "写作提示 721", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-722", title: "写作提示 722", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-723", title: "写作提示 723", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-724", title: "写作提示 724", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-725", title: "写作提示 725", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-726", title: "写作提示 726", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-727", title: "写作提示 727", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-728", title: "写作提示 728", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-729", title: "写作提示 729", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-730", title: "写作提示 730", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-731", title: "写作提示 731", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-732", title: "写作提示 732", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-733", title: "写作提示 733", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-734", title: "写作提示 734", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-735", title: "写作提示 735", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-736", title: "写作提示 736", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-737", title: "写作提示 737", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-738", title: "写作提示 738", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-739", title: "写作提示 739", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-740", title: "写作提示 740", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-741", title: "写作提示 741", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-742", title: "写作提示 742", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-743", title: "写作提示 743", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-744", title: "写作提示 744", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-745", title: "写作提示 745", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-746", title: "写作提示 746", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-747", title: "写作提示 747", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-748", title: "写作提示 748", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-749", title: "写作提示 749", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-750", title: "写作提示 750", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-751", title: "写作提示 751", question: "今天关于学习，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-752", title: "写作提示 752", question: "今天关于心情，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-753", title: "写作提示 753", question: "今天关于朋友，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-754", title: "写作提示 754", question: "今天关于家庭，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-755", title: "写作提示 755", question: "今天关于宇宙，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-756", title: "写作提示 756", question: "今天关于植物，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-757", title: "写作提示 757", question: "今天关于运动，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-758", title: "写作提示 758", question: "今天关于阅读，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-759", title: "写作提示 759", question: "今天关于电脑，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
  { id: "prompt-760", title: "写作提示 760", question: "今天关于观察，有什么小事情值得记录？请写清楚发生了什么、你怎么想、下一步想做什么。" },
]);
const dailyChallengeBank = Object.freeze([
  { id: "challenge-001", action: "加一张图", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-002", action: "写一个问题", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-003", action: "写一个新词", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-004", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-005", action: "写一个发现", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-006", action: "写一个计划", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-007", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-008", action: "写三句话", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-009", action: "加一张图", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-010", action: "写一个问题", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-011", action: "写一个新词", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-012", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-013", action: "写一个发现", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-014", action: "写一个计划", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-015", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-016", action: "写三句话", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-017", action: "加一张图", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-018", action: "写一个问题", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-019", action: "写一个新词", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-020", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-021", action: "写一个发现", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-022", action: "写一个计划", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-023", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-024", action: "写三句话", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-025", action: "加一张图", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-026", action: "写一个问题", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-027", action: "写一个新词", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-028", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-029", action: "写一个发现", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-030", action: "写一个计划", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-031", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-032", action: "写三句话", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-033", action: "加一张图", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-034", action: "写一个问题", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-035", action: "写一个新词", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-036", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-037", action: "写一个发现", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-038", action: "写一个计划", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-039", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-040", action: "写三句话", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-041", action: "加一张图", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-042", action: "写一个问题", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-043", action: "写一个新词", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-044", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-045", action: "写一个发现", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-046", action: "写一个计划", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-047", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-048", action: "写三句话", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-049", action: "加一张图", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-050", action: "写一个问题", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-051", action: "写一个新词", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-052", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-053", action: "写一个发现", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-054", action: "写一个计划", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-055", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-056", action: "写三句话", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-057", action: "加一张图", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-058", action: "写一个问题", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-059", action: "写一个新词", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-060", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-061", action: "写一个发现", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-062", action: "写一个计划", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-063", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-064", action: "写三句话", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-065", action: "加一张图", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-066", action: "写一个问题", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-067", action: "写一个新词", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-068", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-069", action: "写一个发现", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-070", action: "写一个计划", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-071", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-072", action: "写三句话", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-073", action: "加一张图", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-074", action: "写一个问题", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-075", action: "写一个新词", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-076", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-077", action: "写一个发现", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-078", action: "写一个计划", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-079", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-080", action: "写三句话", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-081", action: "加一张图", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-082", action: "写一个问题", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-083", action: "写一个新词", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-084", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-085", action: "写一个发现", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-086", action: "写一个计划", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-087", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-088", action: "写三句话", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-089", action: "加一张图", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-090", action: "写一个问题", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-091", action: "写一个新词", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-092", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-093", action: "写一个发现", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-094", action: "写一个计划", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-095", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-096", action: "写三句话", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-097", action: "加一张图", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-098", action: "写一个问题", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-099", action: "写一个新词", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-100", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-101", action: "写一个发现", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-102", action: "写一个计划", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-103", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-104", action: "写三句话", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-105", action: "加一张图", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-106", action: "写一个问题", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-107", action: "写一个新词", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-108", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-109", action: "写一个发现", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-110", action: "写一个计划", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-111", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-112", action: "写三句话", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-113", action: "加一张图", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-114", action: "写一个问题", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-115", action: "写一个新词", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-116", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-117", action: "写一个发现", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-118", action: "写一个计划", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-119", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-120", action: "写三句话", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-121", action: "加一张图", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-122", action: "写一个问题", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-123", action: "写一个新词", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-124", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-125", action: "写一个发现", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-126", action: "写一个计划", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-127", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-128", action: "写三句话", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-129", action: "加一张图", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-130", action: "写一个问题", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-131", action: "写一个新词", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-132", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-133", action: "写一个发现", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-134", action: "写一个计划", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-135", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-136", action: "写三句话", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-137", action: "加一张图", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-138", action: "写一个问题", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-139", action: "写一个新词", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-140", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-141", action: "写一个发现", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-142", action: "写一个计划", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-143", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-144", action: "写三句话", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-145", action: "加一张图", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-146", action: "写一个问题", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-147", action: "写一个新词", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-148", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-149", action: "写一个发现", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-150", action: "写一个计划", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-151", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-152", action: "写三句话", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-153", action: "加一张图", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-154", action: "写一个问题", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-155", action: "写一个新词", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-156", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-157", action: "写一个发现", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-158", action: "写一个计划", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-159", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-160", action: "写三句话", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-161", action: "加一张图", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-162", action: "写一个问题", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-163", action: "写一个新词", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-164", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-165", action: "写一个发现", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-166", action: "写一个计划", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-167", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-168", action: "写三句话", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-169", action: "加一张图", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-170", action: "写一个问题", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-171", action: "写一个新词", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-172", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-173", action: "写一个发现", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-174", action: "写一个计划", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-175", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-176", action: "写三句话", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-177", action: "加一张图", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-178", action: "写一个问题", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-179", action: "写一个新词", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-180", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-181", action: "写一个发现", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-182", action: "写一个计划", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-183", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-184", action: "写三句话", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-185", action: "加一张图", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-186", action: "写一个问题", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-187", action: "写一个新词", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-188", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-189", action: "写一个发现", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-190", action: "写一个计划", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-191", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-192", action: "写三句话", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-193", action: "加一张图", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-194", action: "写一个问题", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-195", action: "写一个新词", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-196", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-197", action: "写一个发现", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-198", action: "写一个计划", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-199", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-200", action: "写三句话", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-201", action: "加一张图", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-202", action: "写一个问题", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-203", action: "写一个新词", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-204", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-205", action: "写一个发现", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-206", action: "写一个计划", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-207", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-208", action: "写三句话", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-209", action: "加一张图", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-210", action: "写一个问题", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-211", action: "写一个新词", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-212", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-213", action: "写一个发现", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-214", action: "写一个计划", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-215", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-216", action: "写三句话", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-217", action: "加一张图", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-218", action: "写一个问题", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-219", action: "写一个新词", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-220", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-221", action: "写一个发现", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-222", action: "写一个计划", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-223", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-224", action: "写三句话", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-225", action: "加一张图", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-226", action: "写一个问题", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-227", action: "写一个新词", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-228", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-229", action: "写一个发现", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-230", action: "写一个计划", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-231", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-232", action: "写三句话", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-233", action: "加一张图", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-234", action: "写一个问题", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-235", action: "写一个新词", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-236", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-237", action: "写一个发现", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-238", action: "写一个计划", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-239", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-240", action: "写三句话", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-241", action: "加一张图", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-242", action: "写一个问题", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-243", action: "写一个新词", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-244", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-245", action: "写一个发现", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-246", action: "写一个计划", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-247", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-248", action: "写三句话", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-249", action: "加一张图", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-250", action: "写一个问题", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-251", action: "写一个新词", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-252", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-253", action: "写一个发现", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-254", action: "写一个计划", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-255", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-256", action: "写三句话", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-257", action: "加一张图", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-258", action: "写一个问题", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-259", action: "写一个新词", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-260", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-261", action: "写一个发现", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-262", action: "写一个计划", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-263", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-264", action: "写三句话", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-265", action: "加一张图", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-266", action: "写一个问题", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-267", action: "写一个新词", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-268", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-269", action: "写一个发现", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-270", action: "写一个计划", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-271", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-272", action: "写三句话", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-273", action: "加一张图", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-274", action: "写一个问题", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-275", action: "写一个新词", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-276", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-277", action: "写一个发现", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-278", action: "写一个计划", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-279", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-280", action: "写三句话", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-281", action: "加一张图", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-282", action: "写一个问题", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-283", action: "写一个新词", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-284", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-285", action: "写一个发现", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-286", action: "写一个计划", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-287", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-288", action: "写三句话", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-289", action: "加一张图", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-290", action: "写一个问题", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-291", action: "写一个新词", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-292", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-293", action: "写一个发现", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-294", action: "写一个计划", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-295", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-296", action: "写三句话", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-297", action: "加一张图", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-298", action: "写一个问题", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-299", action: "写一个新词", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-300", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-301", action: "写一个发现", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-302", action: "写一个计划", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-303", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-304", action: "写三句话", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-305", action: "加一张图", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-306", action: "写一个问题", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-307", action: "写一个新词", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-308", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-309", action: "写一个发现", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-310", action: "写一个计划", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-311", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-312", action: "写三句话", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-313", action: "加一张图", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-314", action: "写一个问题", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-315", action: "写一个新词", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-316", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-317", action: "写一个发现", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-318", action: "写一个计划", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-319", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-320", action: "写三句话", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-321", action: "加一张图", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-322", action: "写一个问题", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-323", action: "写一个新词", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-324", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-325", action: "写一个发现", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-326", action: "写一个计划", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-327", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-328", action: "写三句话", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-329", action: "加一张图", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-330", action: "写一个问题", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-331", action: "写一个新词", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-332", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-333", action: "写一个发现", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-334", action: "写一个计划", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-335", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-336", action: "写三句话", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-337", action: "加一张图", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-338", action: "写一个问题", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-339", action: "写一个新词", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-340", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-341", action: "写一个发现", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-342", action: "写一个计划", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-343", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-344", action: "写三句话", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-345", action: "加一张图", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-346", action: "写一个问题", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-347", action: "写一个新词", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-348", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-349", action: "写一个发现", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-350", action: "写一个计划", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-351", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-352", action: "写三句话", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-353", action: "加一张图", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-354", action: "写一个问题", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-355", action: "写一个新词", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-356", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-357", action: "写一个发现", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-358", action: "写一个计划", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-359", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-360", action: "写三句话", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-361", action: "加一张图", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-362", action: "写一个问题", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-363", action: "写一个新词", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-364", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-365", action: "写一个发现", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-366", action: "写一个计划", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-367", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-368", action: "写三句话", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-369", action: "加一张图", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-370", action: "写一个问题", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-371", action: "写一个新词", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-372", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-373", action: "写一个发现", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-374", action: "写一个计划", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-375", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-376", action: "写三句话", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-377", action: "加一张图", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-378", action: "写一个问题", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-379", action: "写一个新词", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-380", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-381", action: "写一个发现", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-382", action: "写一个计划", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-383", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-384", action: "写三句话", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-385", action: "加一张图", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-386", action: "写一个问题", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-387", action: "写一个新词", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-388", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-389", action: "写一个发现", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-390", action: "写一个计划", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-391", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-392", action: "写三句话", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-393", action: "加一张图", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-394", action: "写一个问题", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-395", action: "写一个新词", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-396", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-397", action: "写一个发现", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-398", action: "写一个计划", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-399", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-400", action: "写三句话", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-401", action: "加一张图", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-402", action: "写一个问题", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-403", action: "写一个新词", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-404", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-405", action: "写一个发现", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-406", action: "写一个计划", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-407", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-408", action: "写三句话", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-409", action: "加一张图", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-410", action: "写一个问题", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-411", action: "写一个新词", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-412", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-413", action: "写一个发现", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-414", action: "写一个计划", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-415", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-416", action: "写三句话", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-417", action: "加一张图", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-418", action: "写一个问题", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-419", action: "写一个新词", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-420", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-421", action: "写一个发现", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-422", action: "写一个计划", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-423", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-424", action: "写三句话", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-425", action: "加一张图", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-426", action: "写一个问题", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-427", action: "写一个新词", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-428", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-429", action: "写一个发现", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-430", action: "写一个计划", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-431", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-432", action: "写三句话", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-433", action: "加一张图", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-434", action: "写一个问题", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-435", action: "写一个新词", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-436", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-437", action: "写一个发现", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-438", action: "写一个计划", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-439", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-440", action: "写三句话", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-441", action: "加一张图", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-442", action: "写一个问题", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-443", action: "写一个新词", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-444", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-445", action: "写一个发现", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-446", action: "写一个计划", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-447", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-448", action: "写三句话", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-449", action: "加一张图", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-450", action: "写一个问题", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-451", action: "写一个新词", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-452", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-453", action: "写一个发现", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-454", action: "写一个计划", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-455", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-456", action: "写三句话", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-457", action: "加一张图", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-458", action: "写一个问题", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-459", action: "写一个新词", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-460", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-461", action: "写一个发现", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-462", action: "写一个计划", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-463", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-464", action: "写三句话", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-465", action: "加一张图", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-466", action: "写一个问题", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-467", action: "写一个新词", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-468", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-469", action: "写一个发现", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-470", action: "写一个计划", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-471", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-472", action: "写三句话", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-473", action: "加一张图", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-474", action: "写一个问题", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-475", action: "写一个新词", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-476", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-477", action: "写一个发现", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-478", action: "写一个计划", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-479", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-480", action: "写三句话", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-481", action: "加一张图", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-482", action: "写一个问题", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-483", action: "写一个新词", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-484", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-485", action: "写一个发现", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-486", action: "写一个计划", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-487", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-488", action: "写三句话", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-489", action: "加一张图", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-490", action: "写一个问题", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-491", action: "写一个新词", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-492", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-493", action: "写一个发现", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-494", action: "写一个计划", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-495", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-496", action: "写三句话", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-497", action: "加一张图", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-498", action: "写一个问题", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-499", action: "写一个新词", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-500", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-501", action: "写一个发现", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-502", action: "写一个计划", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-503", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-504", action: "写三句话", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-505", action: "加一张图", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-506", action: "写一个问题", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-507", action: "写一个新词", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-508", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-509", action: "写一个发现", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-510", action: "写一个计划", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-511", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-512", action: "写三句话", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-513", action: "加一张图", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-514", action: "写一个问题", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-515", action: "写一个新词", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-516", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-517", action: "写一个发现", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-518", action: "写一个计划", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-519", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-520", action: "写三句话", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-521", action: "加一张图", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-522", action: "写一个问题", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-523", action: "写一个新词", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-524", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-525", action: "写一个发现", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-526", action: "写一个计划", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-527", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-528", action: "写三句话", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-529", action: "加一张图", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-530", action: "写一个问题", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-531", action: "写一个新词", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-532", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-533", action: "写一个发现", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-534", action: "写一个计划", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-535", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-536", action: "写三句话", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-537", action: "加一张图", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-538", action: "写一个问题", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-539", action: "写一个新词", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-540", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-541", action: "写一个发现", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-542", action: "写一个计划", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-543", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-544", action: "写三句话", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-545", action: "加一张图", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-546", action: "写一个问题", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-547", action: "写一个新词", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-548", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-549", action: "写一个发现", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-550", action: "写一个计划", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-551", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-552", action: "写三句话", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-553", action: "加一张图", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-554", action: "写一个问题", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-555", action: "写一个新词", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-556", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-557", action: "写一个发现", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-558", action: "写一个计划", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-559", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-560", action: "写三句话", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-561", action: "加一张图", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-562", action: "写一个问题", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-563", action: "写一个新词", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-564", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-565", action: "写一个发现", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-566", action: "写一个计划", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-567", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-568", action: "写三句话", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-569", action: "加一张图", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-570", action: "写一个问题", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-571", action: "写一个新词", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-572", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-573", action: "写一个发现", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-574", action: "写一个计划", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-575", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-576", action: "写三句话", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-577", action: "加一张图", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-578", action: "写一个问题", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-579", action: "写一个新词", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-580", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-581", action: "写一个发现", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-582", action: "写一个计划", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-583", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-584", action: "写三句话", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-585", action: "加一张图", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-586", action: "写一个问题", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-587", action: "写一个新词", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-588", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-589", action: "写一个发现", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-590", action: "写一个计划", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-591", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-592", action: "写三句话", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-593", action: "加一张图", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-594", action: "写一个问题", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-595", action: "写一个新词", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-596", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-597", action: "写一个发现", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-598", action: "写一个计划", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-599", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-600", action: "写三句话", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-601", action: "加一张图", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-602", action: "写一个问题", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-603", action: "写一个新词", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-604", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-605", action: "写一个发现", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-606", action: "写一个计划", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-607", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-608", action: "写三句话", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-609", action: "加一张图", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-610", action: "写一个问题", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-611", action: "写一个新词", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-612", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-613", action: "写一个发现", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-614", action: "写一个计划", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-615", action: "写一个比喻", reward: "完成后给自己一个小星星", level: 1 },
  { id: "challenge-616", action: "写三句话", reward: "完成后给自己一个小星星", level: 2 },
  { id: "challenge-617", action: "加一张图", reward: "完成后给自己一个小星星", level: 3 },
  { id: "challenge-618", action: "写一个问题", reward: "完成后给自己一个小星星", level: 4 },
  { id: "challenge-619", action: "写一个新词", reward: "完成后给自己一个小星星", level: 5 },
  { id: "challenge-620", action: "写一个感谢", reward: "完成后给自己一个小星星", level: 1 },
]);
const colorPresetBank = Object.freeze([
  { name: "颜色 001", value: "hsl(29 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 002", value: "hsl(58 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 003", value: "hsl(87 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 004", value: "hsl(116 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 005", value: "hsl(145 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 006", value: "hsl(174 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 007", value: "hsl(203 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 008", value: "hsl(232 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 009", value: "hsl(261 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 010", value: "hsl(290 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 011", value: "hsl(319 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 012", value: "hsl(348 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 013", value: "hsl(17 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 014", value: "hsl(46 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 015", value: "hsl(75 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 016", value: "hsl(104 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 017", value: "hsl(133 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 018", value: "hsl(162 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 019", value: "hsl(191 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 020", value: "hsl(220 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 021", value: "hsl(249 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 022", value: "hsl(278 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 023", value: "hsl(307 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 024", value: "hsl(336 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 025", value: "hsl(5 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 026", value: "hsl(34 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 027", value: "hsl(63 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 028", value: "hsl(92 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 029", value: "hsl(121 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 030", value: "hsl(150 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 031", value: "hsl(179 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 032", value: "hsl(208 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 033", value: "hsl(237 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 034", value: "hsl(266 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 035", value: "hsl(295 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 036", value: "hsl(324 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 037", value: "hsl(353 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 038", value: "hsl(22 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 039", value: "hsl(51 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 040", value: "hsl(80 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 041", value: "hsl(109 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 042", value: "hsl(138 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 043", value: "hsl(167 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 044", value: "hsl(196 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 045", value: "hsl(225 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 046", value: "hsl(254 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 047", value: "hsl(283 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 048", value: "hsl(312 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 049", value: "hsl(341 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 050", value: "hsl(10 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 051", value: "hsl(39 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 052", value: "hsl(68 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 053", value: "hsl(97 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 054", value: "hsl(126 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 055", value: "hsl(155 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 056", value: "hsl(184 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 057", value: "hsl(213 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 058", value: "hsl(242 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 059", value: "hsl(271 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 060", value: "hsl(300 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 061", value: "hsl(329 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 062", value: "hsl(358 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 063", value: "hsl(27 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 064", value: "hsl(56 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 065", value: "hsl(85 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 066", value: "hsl(114 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 067", value: "hsl(143 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 068", value: "hsl(172 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 069", value: "hsl(201 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 070", value: "hsl(230 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 071", value: "hsl(259 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 072", value: "hsl(288 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 073", value: "hsl(317 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 074", value: "hsl(346 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 075", value: "hsl(15 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 076", value: "hsl(44 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 077", value: "hsl(73 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 078", value: "hsl(102 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 079", value: "hsl(131 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 080", value: "hsl(160 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 081", value: "hsl(189 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 082", value: "hsl(218 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 083", value: "hsl(247 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 084", value: "hsl(276 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 085", value: "hsl(305 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 086", value: "hsl(334 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 087", value: "hsl(3 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 088", value: "hsl(32 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 089", value: "hsl(61 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 090", value: "hsl(90 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 091", value: "hsl(119 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 092", value: "hsl(148 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 093", value: "hsl(177 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 094", value: "hsl(206 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 095", value: "hsl(235 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 096", value: "hsl(264 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 097", value: "hsl(293 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 098", value: "hsl(322 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 099", value: "hsl(351 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 100", value: "hsl(20 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 101", value: "hsl(49 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 102", value: "hsl(78 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 103", value: "hsl(107 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 104", value: "hsl(136 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 105", value: "hsl(165 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 106", value: "hsl(194 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 107", value: "hsl(223 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 108", value: "hsl(252 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 109", value: "hsl(281 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 110", value: "hsl(310 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 111", value: "hsl(339 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 112", value: "hsl(8 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 113", value: "hsl(37 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 114", value: "hsl(66 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 115", value: "hsl(95 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 116", value: "hsl(124 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 117", value: "hsl(153 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 118", value: "hsl(182 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 119", value: "hsl(211 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 120", value: "hsl(240 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 121", value: "hsl(269 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 122", value: "hsl(298 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 123", value: "hsl(327 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 124", value: "hsl(356 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 125", value: "hsl(25 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 126", value: "hsl(54 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 127", value: "hsl(83 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 128", value: "hsl(112 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 129", value: "hsl(141 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 130", value: "hsl(170 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 131", value: "hsl(199 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 132", value: "hsl(228 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 133", value: "hsl(257 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 134", value: "hsl(286 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 135", value: "hsl(315 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 136", value: "hsl(344 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 137", value: "hsl(13 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 138", value: "hsl(42 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 139", value: "hsl(71 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 140", value: "hsl(100 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 141", value: "hsl(129 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 142", value: "hsl(158 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 143", value: "hsl(187 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 144", value: "hsl(216 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 145", value: "hsl(245 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 146", value: "hsl(274 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 147", value: "hsl(303 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 148", value: "hsl(332 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 149", value: "hsl(1 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 150", value: "hsl(30 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 151", value: "hsl(59 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 152", value: "hsl(88 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 153", value: "hsl(117 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 154", value: "hsl(146 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 155", value: "hsl(175 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 156", value: "hsl(204 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 157", value: "hsl(233 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 158", value: "hsl(262 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 159", value: "hsl(291 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 160", value: "hsl(320 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 161", value: "hsl(349 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 162", value: "hsl(18 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 163", value: "hsl(47 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 164", value: "hsl(76 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 165", value: "hsl(105 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 166", value: "hsl(134 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 167", value: "hsl(163 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 168", value: "hsl(192 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 169", value: "hsl(221 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 170", value: "hsl(250 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 171", value: "hsl(279 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 172", value: "hsl(308 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 173", value: "hsl(337 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 174", value: "hsl(6 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 175", value: "hsl(35 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 176", value: "hsl(64 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 177", value: "hsl(93 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 178", value: "hsl(122 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 179", value: "hsl(151 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 180", value: "hsl(180 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 181", value: "hsl(209 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 182", value: "hsl(238 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 183", value: "hsl(267 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 184", value: "hsl(296 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 185", value: "hsl(325 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 186", value: "hsl(354 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 187", value: "hsl(23 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 188", value: "hsl(52 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 189", value: "hsl(81 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 190", value: "hsl(110 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 191", value: "hsl(139 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 192", value: "hsl(168 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 193", value: "hsl(197 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 194", value: "hsl(226 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 195", value: "hsl(255 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 196", value: "hsl(284 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 197", value: "hsl(313 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 198", value: "hsl(342 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 199", value: "hsl(11 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 200", value: "hsl(40 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 201", value: "hsl(69 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 202", value: "hsl(98 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 203", value: "hsl(127 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 204", value: "hsl(156 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 205", value: "hsl(185 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 206", value: "hsl(214 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 207", value: "hsl(243 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 208", value: "hsl(272 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 209", value: "hsl(301 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 210", value: "hsl(330 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 211", value: "hsl(359 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 212", value: "hsl(28 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 213", value: "hsl(57 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 214", value: "hsl(86 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 215", value: "hsl(115 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 216", value: "hsl(144 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 217", value: "hsl(173 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 218", value: "hsl(202 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 219", value: "hsl(231 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 220", value: "hsl(260 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 221", value: "hsl(289 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 222", value: "hsl(318 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 223", value: "hsl(347 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 224", value: "hsl(16 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 225", value: "hsl(45 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 226", value: "hsl(74 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 227", value: "hsl(103 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 228", value: "hsl(132 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 229", value: "hsl(161 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 230", value: "hsl(190 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 231", value: "hsl(219 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 232", value: "hsl(248 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 233", value: "hsl(277 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 234", value: "hsl(306 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 235", value: "hsl(335 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 236", value: "hsl(4 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 237", value: "hsl(33 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 238", value: "hsl(62 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 239", value: "hsl(91 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 240", value: "hsl(120 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 241", value: "hsl(149 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 242", value: "hsl(178 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 243", value: "hsl(207 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 244", value: "hsl(236 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 245", value: "hsl(265 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 246", value: "hsl(294 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 247", value: "hsl(323 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 248", value: "hsl(352 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 249", value: "hsl(21 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 250", value: "hsl(50 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 251", value: "hsl(79 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 252", value: "hsl(108 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 253", value: "hsl(137 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 254", value: "hsl(166 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 255", value: "hsl(195 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 256", value: "hsl(224 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 257", value: "hsl(253 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 258", value: "hsl(282 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 259", value: "hsl(311 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 260", value: "hsl(340 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 261", value: "hsl(9 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 262", value: "hsl(38 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 263", value: "hsl(67 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 264", value: "hsl(96 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 265", value: "hsl(125 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 266", value: "hsl(154 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 267", value: "hsl(183 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 268", value: "hsl(212 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 269", value: "hsl(241 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 270", value: "hsl(270 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 271", value: "hsl(299 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 272", value: "hsl(328 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 273", value: "hsl(357 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 274", value: "hsl(26 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 275", value: "hsl(55 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 276", value: "hsl(84 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 277", value: "hsl(113 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 278", value: "hsl(142 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 279", value: "hsl(171 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 280", value: "hsl(200 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 281", value: "hsl(229 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 282", value: "hsl(258 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 283", value: "hsl(287 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 284", value: "hsl(316 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 285", value: "hsl(345 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 286", value: "hsl(14 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 287", value: "hsl(43 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 288", value: "hsl(72 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 289", value: "hsl(101 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 290", value: "hsl(130 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 291", value: "hsl(159 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 292", value: "hsl(188 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 293", value: "hsl(217 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 294", value: "hsl(246 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 295", value: "hsl(275 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 296", value: "hsl(304 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 297", value: "hsl(333 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 298", value: "hsl(2 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 299", value: "hsl(31 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 300", value: "hsl(60 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 301", value: "hsl(89 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 302", value: "hsl(118 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 303", value: "hsl(147 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 304", value: "hsl(176 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 305", value: "hsl(205 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 306", value: "hsl(234 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 307", value: "hsl(263 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 308", value: "hsl(292 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 309", value: "hsl(321 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 310", value: "hsl(350 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 311", value: "hsl(19 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 312", value: "hsl(48 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 313", value: "hsl(77 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 314", value: "hsl(106 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 315", value: "hsl(135 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 316", value: "hsl(164 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 317", value: "hsl(193 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 318", value: "hsl(222 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 319", value: "hsl(251 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 320", value: "hsl(280 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 321", value: "hsl(309 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 322", value: "hsl(338 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 323", value: "hsl(7 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 324", value: "hsl(36 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 325", value: "hsl(65 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 326", value: "hsl(94 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 327", value: "hsl(123 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 328", value: "hsl(152 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 329", value: "hsl(181 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 330", value: "hsl(210 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 331", value: "hsl(239 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 332", value: "hsl(268 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 333", value: "hsl(297 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 334", value: "hsl(326 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 335", value: "hsl(355 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 336", value: "hsl(24 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 337", value: "hsl(53 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 338", value: "hsl(82 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 339", value: "hsl(111 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 340", value: "hsl(140 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 341", value: "hsl(169 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 342", value: "hsl(198 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 343", value: "hsl(227 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 344", value: "hsl(256 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 345", value: "hsl(285 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 346", value: "hsl(314 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 347", value: "hsl(343 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 348", value: "hsl(12 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 349", value: "hsl(41 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 350", value: "hsl(70 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 351", value: "hsl(99 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 352", value: "hsl(128 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 353", value: "hsl(157 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 354", value: "hsl(186 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 355", value: "hsl(215 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 356", value: "hsl(244 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 357", value: "hsl(273 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 358", value: "hsl(302 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 359", value: "hsl(331 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 360", value: "hsl(0 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 361", value: "hsl(29 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 362", value: "hsl(58 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 363", value: "hsl(87 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 364", value: "hsl(116 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 365", value: "hsl(145 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 366", value: "hsl(174 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 367", value: "hsl(203 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 368", value: "hsl(232 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 369", value: "hsl(261 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 370", value: "hsl(290 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 371", value: "hsl(319 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 372", value: "hsl(348 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 373", value: "hsl(17 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 374", value: "hsl(46 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 375", value: "hsl(75 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 376", value: "hsl(104 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 377", value: "hsl(133 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 378", value: "hsl(162 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 379", value: "hsl(191 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 380", value: "hsl(220 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 381", value: "hsl(249 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 382", value: "hsl(278 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 383", value: "hsl(307 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 384", value: "hsl(336 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 385", value: "hsl(5 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 386", value: "hsl(34 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 387", value: "hsl(63 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 388", value: "hsl(92 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 389", value: "hsl(121 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 390", value: "hsl(150 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 391", value: "hsl(179 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 392", value: "hsl(208 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 393", value: "hsl(237 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 394", value: "hsl(266 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 395", value: "hsl(295 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 396", value: "hsl(324 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 397", value: "hsl(353 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 398", value: "hsl(22 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 399", value: "hsl(51 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 400", value: "hsl(80 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 401", value: "hsl(109 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 402", value: "hsl(138 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 403", value: "hsl(167 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 404", value: "hsl(196 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 405", value: "hsl(225 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 406", value: "hsl(254 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 407", value: "hsl(283 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 408", value: "hsl(312 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 409", value: "hsl(341 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 410", value: "hsl(10 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 411", value: "hsl(39 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 412", value: "hsl(68 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 413", value: "hsl(97 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 414", value: "hsl(126 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 415", value: "hsl(155 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 416", value: "hsl(184 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 417", value: "hsl(213 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 418", value: "hsl(242 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 419", value: "hsl(271 52% 38%)", use: "日记文字或标签颜色" },
  { name: "颜色 420", value: "hsl(300 52% 38%)", use: "日记文字或标签颜色" },
]);
function helperFormatter001(text) { return String(text || "").trim(); }
function helperFormatter002(text) { return String(text || "").trim(); }
function helperFormatter003(text) { return String(text || "").trim(); }
function helperFormatter004(text) { return String(text || "").trim(); }
function helperFormatter005(text) { return String(text || "").trim(); }
function helperFormatter006(text) { return String(text || "").trim(); }
function helperFormatter007(text) { return String(text || "").trim(); }
function helperFormatter008(text) { return String(text || "").trim(); }
function helperFormatter009(text) { return String(text || "").trim(); }
function helperFormatter010(text) { return String(text || "").trim(); }
function helperFormatter011(text) { return String(text || "").trim(); }
function helperFormatter012(text) { return String(text || "").trim(); }
function helperFormatter013(text) { return String(text || "").trim(); }
function helperFormatter014(text) { return String(text || "").trim(); }
function helperFormatter015(text) { return String(text || "").trim(); }
function helperFormatter016(text) { return String(text || "").trim(); }
function helperFormatter017(text) { return String(text || "").trim(); }
function helperFormatter018(text) { return String(text || "").trim(); }
function helperFormatter019(text) { return String(text || "").trim(); }
function helperFormatter020(text) { return String(text || "").trim(); }
function helperFormatter021(text) { return String(text || "").trim(); }
function helperFormatter022(text) { return String(text || "").trim(); }
function helperFormatter023(text) { return String(text || "").trim(); }
function helperFormatter024(text) { return String(text || "").trim(); }
function helperFormatter025(text) { return String(text || "").trim(); }
function helperFormatter026(text) { return String(text || "").trim(); }
function helperFormatter027(text) { return String(text || "").trim(); }
function helperFormatter028(text) { return String(text || "").trim(); }
function helperFormatter029(text) { return String(text || "").trim(); }
function helperFormatter030(text) { return String(text || "").trim(); }
function helperFormatter031(text) { return String(text || "").trim(); }
function helperFormatter032(text) { return String(text || "").trim(); }
function helperFormatter033(text) { return String(text || "").trim(); }
function helperFormatter034(text) { return String(text || "").trim(); }
function helperFormatter035(text) { return String(text || "").trim(); }
function helperFormatter036(text) { return String(text || "").trim(); }
function helperFormatter037(text) { return String(text || "").trim(); }
function helperFormatter038(text) { return String(text || "").trim(); }
function helperFormatter039(text) { return String(text || "").trim(); }
function helperFormatter040(text) { return String(text || "").trim(); }
function helperFormatter041(text) { return String(text || "").trim(); }
function helperFormatter042(text) { return String(text || "").trim(); }
function helperFormatter043(text) { return String(text || "").trim(); }
function helperFormatter044(text) { return String(text || "").trim(); }
function helperFormatter045(text) { return String(text || "").trim(); }
function helperFormatter046(text) { return String(text || "").trim(); }
function helperFormatter047(text) { return String(text || "").trim(); }
function helperFormatter048(text) { return String(text || "").trim(); }
function helperFormatter049(text) { return String(text || "").trim(); }
function helperFormatter050(text) { return String(text || "").trim(); }
function helperFormatter051(text) { return String(text || "").trim(); }
function helperFormatter052(text) { return String(text || "").trim(); }
function helperFormatter053(text) { return String(text || "").trim(); }
function helperFormatter054(text) { return String(text || "").trim(); }
function helperFormatter055(text) { return String(text || "").trim(); }
function helperFormatter056(text) { return String(text || "").trim(); }
function helperFormatter057(text) { return String(text || "").trim(); }
function helperFormatter058(text) { return String(text || "").trim(); }
function helperFormatter059(text) { return String(text || "").trim(); }
function helperFormatter060(text) { return String(text || "").trim(); }
function helperFormatter061(text) { return String(text || "").trim(); }
function helperFormatter062(text) { return String(text || "").trim(); }
function helperFormatter063(text) { return String(text || "").trim(); }
function helperFormatter064(text) { return String(text || "").trim(); }
function helperFormatter065(text) { return String(text || "").trim(); }
function helperFormatter066(text) { return String(text || "").trim(); }
function helperFormatter067(text) { return String(text || "").trim(); }
function helperFormatter068(text) { return String(text || "").trim(); }
function helperFormatter069(text) { return String(text || "").trim(); }
function helperFormatter070(text) { return String(text || "").trim(); }
function helperFormatter071(text) { return String(text || "").trim(); }
function helperFormatter072(text) { return String(text || "").trim(); }
function helperFormatter073(text) { return String(text || "").trim(); }
function helperFormatter074(text) { return String(text || "").trim(); }
function helperFormatter075(text) { return String(text || "").trim(); }
function helperFormatter076(text) { return String(text || "").trim(); }
function helperFormatter077(text) { return String(text || "").trim(); }
function helperFormatter078(text) { return String(text || "").trim(); }
function helperFormatter079(text) { return String(text || "").trim(); }
function helperFormatter080(text) { return String(text || "").trim(); }
function helperFormatter081(text) { return String(text || "").trim(); }
function helperFormatter082(text) { return String(text || "").trim(); }
function helperFormatter083(text) { return String(text || "").trim(); }
function helperFormatter084(text) { return String(text || "").trim(); }
function helperFormatter085(text) { return String(text || "").trim(); }
function helperFormatter086(text) { return String(text || "").trim(); }
function helperFormatter087(text) { return String(text || "").trim(); }
function helperFormatter088(text) { return String(text || "").trim(); }
function helperFormatter089(text) { return String(text || "").trim(); }
function helperFormatter090(text) { return String(text || "").trim(); }
function helperFormatter091(text) { return String(text || "").trim(); }
function helperFormatter092(text) { return String(text || "").trim(); }
function helperFormatter093(text) { return String(text || "").trim(); }
function helperFormatter094(text) { return String(text || "").trim(); }
function helperFormatter095(text) { return String(text || "").trim(); }
function helperFormatter096(text) { return String(text || "").trim(); }
function helperFormatter097(text) { return String(text || "").trim(); }
function helperFormatter098(text) { return String(text || "").trim(); }
function helperFormatter099(text) { return String(text || "").trim(); }
function helperFormatter100(text) { return String(text || "").trim(); }
function helperFormatter101(text) { return String(text || "").trim(); }
function helperFormatter102(text) { return String(text || "").trim(); }
function helperFormatter103(text) { return String(text || "").trim(); }
function helperFormatter104(text) { return String(text || "").trim(); }
function helperFormatter105(text) { return String(text || "").trim(); }
function helperFormatter106(text) { return String(text || "").trim(); }
function helperFormatter107(text) { return String(text || "").trim(); }
function helperFormatter108(text) { return String(text || "").trim(); }
function helperFormatter109(text) { return String(text || "").trim(); }
function helperFormatter110(text) { return String(text || "").trim(); }
function helperFormatter111(text) { return String(text || "").trim(); }
function helperFormatter112(text) { return String(text || "").trim(); }
function helperFormatter113(text) { return String(text || "").trim(); }
function helperFormatter114(text) { return String(text || "").trim(); }
function helperFormatter115(text) { return String(text || "").trim(); }
function helperFormatter116(text) { return String(text || "").trim(); }
function helperFormatter117(text) { return String(text || "").trim(); }
function helperFormatter118(text) { return String(text || "").trim(); }
function helperFormatter119(text) { return String(text || "").trim(); }
function helperFormatter120(text) { return String(text || "").trim(); }
function helperFormatter121(text) { return String(text || "").trim(); }
function helperFormatter122(text) { return String(text || "").trim(); }
function helperFormatter123(text) { return String(text || "").trim(); }
function helperFormatter124(text) { return String(text || "").trim(); }
function helperFormatter125(text) { return String(text || "").trim(); }
function helperFormatter126(text) { return String(text || "").trim(); }
function helperFormatter127(text) { return String(text || "").trim(); }
function helperFormatter128(text) { return String(text || "").trim(); }
function helperFormatter129(text) { return String(text || "").trim(); }
function helperFormatter130(text) { return String(text || "").trim(); }
function helperFormatter131(text) { return String(text || "").trim(); }
function helperFormatter132(text) { return String(text || "").trim(); }
function helperFormatter133(text) { return String(text || "").trim(); }
function helperFormatter134(text) { return String(text || "").trim(); }
function helperFormatter135(text) { return String(text || "").trim(); }
function helperFormatter136(text) { return String(text || "").trim(); }
function helperFormatter137(text) { return String(text || "").trim(); }
function helperFormatter138(text) { return String(text || "").trim(); }
function helperFormatter139(text) { return String(text || "").trim(); }
function helperFormatter140(text) { return String(text || "").trim(); }
function helperFormatter141(text) { return String(text || "").trim(); }
function helperFormatter142(text) { return String(text || "").trim(); }
function helperFormatter143(text) { return String(text || "").trim(); }
function helperFormatter144(text) { return String(text || "").trim(); }
function helperFormatter145(text) { return String(text || "").trim(); }
function helperFormatter146(text) { return String(text || "").trim(); }
function helperFormatter147(text) { return String(text || "").trim(); }
function helperFormatter148(text) { return String(text || "").trim(); }
function helperFormatter149(text) { return String(text || "").trim(); }
function helperFormatter150(text) { return String(text || "").trim(); }
function helperFormatter151(text) { return String(text || "").trim(); }
function helperFormatter152(text) { return String(text || "").trim(); }
function helperFormatter153(text) { return String(text || "").trim(); }
function helperFormatter154(text) { return String(text || "").trim(); }
function helperFormatter155(text) { return String(text || "").trim(); }
function helperFormatter156(text) { return String(text || "").trim(); }
function helperFormatter157(text) { return String(text || "").trim(); }
function helperFormatter158(text) { return String(text || "").trim(); }
function helperFormatter159(text) { return String(text || "").trim(); }
function helperFormatter160(text) { return String(text || "").trim(); }
function helperFormatter161(text) { return String(text || "").trim(); }
function helperFormatter162(text) { return String(text || "").trim(); }
function helperFormatter163(text) { return String(text || "").trim(); }
function helperFormatter164(text) { return String(text || "").trim(); }
function helperFormatter165(text) { return String(text || "").trim(); }
function helperFormatter166(text) { return String(text || "").trim(); }
function helperFormatter167(text) { return String(text || "").trim(); }
function helperFormatter168(text) { return String(text || "").trim(); }
function helperFormatter169(text) { return String(text || "").trim(); }
function helperFormatter170(text) { return String(text || "").trim(); }
function helperFormatter171(text) { return String(text || "").trim(); }
function helperFormatter172(text) { return String(text || "").trim(); }
function helperFormatter173(text) { return String(text || "").trim(); }
function helperFormatter174(text) { return String(text || "").trim(); }
function helperFormatter175(text) { return String(text || "").trim(); }
function helperFormatter176(text) { return String(text || "").trim(); }
function helperFormatter177(text) { return String(text || "").trim(); }
function helperFormatter178(text) { return String(text || "").trim(); }
function helperFormatter179(text) { return String(text || "").trim(); }
function helperFormatter180(text) { return String(text || "").trim(); }
function helperFormatter181(text) { return String(text || "").trim(); }
function helperFormatter182(text) { return String(text || "").trim(); }
function helperFormatter183(text) { return String(text || "").trim(); }
function helperFormatter184(text) { return String(text || "").trim(); }
function helperFormatter185(text) { return String(text || "").trim(); }
function helperFormatter186(text) { return String(text || "").trim(); }
function helperFormatter187(text) { return String(text || "").trim(); }
function helperFormatter188(text) { return String(text || "").trim(); }
function helperFormatter189(text) { return String(text || "").trim(); }
function helperFormatter190(text) { return String(text || "").trim(); }
function helperFormatter191(text) { return String(text || "").trim(); }
function helperFormatter192(text) { return String(text || "").trim(); }
function helperFormatter193(text) { return String(text || "").trim(); }
function helperFormatter194(text) { return String(text || "").trim(); }
function helperFormatter195(text) { return String(text || "").trim(); }
function helperFormatter196(text) { return String(text || "").trim(); }
function helperFormatter197(text) { return String(text || "").trim(); }
function helperFormatter198(text) { return String(text || "").trim(); }
function helperFormatter199(text) { return String(text || "").trim(); }
function helperFormatter200(text) { return String(text || "").trim(); }
function helperFormatter201(text) { return String(text || "").trim(); }
function helperFormatter202(text) { return String(text || "").trim(); }
function helperFormatter203(text) { return String(text || "").trim(); }
function helperFormatter204(text) { return String(text || "").trim(); }
function helperFormatter205(text) { return String(text || "").trim(); }
function helperFormatter206(text) { return String(text || "").trim(); }
function helperFormatter207(text) { return String(text || "").trim(); }
function helperFormatter208(text) { return String(text || "").trim(); }
function helperFormatter209(text) { return String(text || "").trim(); }
function helperFormatter210(text) { return String(text || "").trim(); }
function helperFormatter211(text) { return String(text || "").trim(); }
function helperFormatter212(text) { return String(text || "").trim(); }
function helperFormatter213(text) { return String(text || "").trim(); }
function helperFormatter214(text) { return String(text || "").trim(); }
function helperFormatter215(text) { return String(text || "").trim(); }
function helperFormatter216(text) { return String(text || "").trim(); }
function helperFormatter217(text) { return String(text || "").trim(); }
function helperFormatter218(text) { return String(text || "").trim(); }
function helperFormatter219(text) { return String(text || "").trim(); }
function helperFormatter220(text) { return String(text || "").trim(); }
function helperFormatter221(text) { return String(text || "").trim(); }
function helperFormatter222(text) { return String(text || "").trim(); }
function helperFormatter223(text) { return String(text || "").trim(); }
function helperFormatter224(text) { return String(text || "").trim(); }
function helperFormatter225(text) { return String(text || "").trim(); }
function helperFormatter226(text) { return String(text || "").trim(); }
function helperFormatter227(text) { return String(text || "").trim(); }
function helperFormatter228(text) { return String(text || "").trim(); }
function helperFormatter229(text) { return String(text || "").trim(); }
function helperFormatter230(text) { return String(text || "").trim(); }
function helperFormatter231(text) { return String(text || "").trim(); }
function helperFormatter232(text) { return String(text || "").trim(); }
function helperFormatter233(text) { return String(text || "").trim(); }
function helperFormatter234(text) { return String(text || "").trim(); }
function helperFormatter235(text) { return String(text || "").trim(); }
function helperFormatter236(text) { return String(text || "").trim(); }
function helperFormatter237(text) { return String(text || "").trim(); }
function helperFormatter238(text) { return String(text || "").trim(); }
function helperFormatter239(text) { return String(text || "").trim(); }
function helperFormatter240(text) { return String(text || "").trim(); }
function helperFormatter241(text) { return String(text || "").trim(); }
function helperFormatter242(text) { return String(text || "").trim(); }
function helperFormatter243(text) { return String(text || "").trim(); }
function helperFormatter244(text) { return String(text || "").trim(); }
function helperFormatter245(text) { return String(text || "").trim(); }
function helperFormatter246(text) { return String(text || "").trim(); }
function helperFormatter247(text) { return String(text || "").trim(); }
function helperFormatter248(text) { return String(text || "").trim(); }
function helperFormatter249(text) { return String(text || "").trim(); }
function helperFormatter250(text) { return String(text || "").trim(); }
function helperFormatter251(text) { return String(text || "").trim(); }
function helperFormatter252(text) { return String(text || "").trim(); }
function helperFormatter253(text) { return String(text || "").trim(); }
function helperFormatter254(text) { return String(text || "").trim(); }
function helperFormatter255(text) { return String(text || "").trim(); }
function helperFormatter256(text) { return String(text || "").trim(); }
function helperFormatter257(text) { return String(text || "").trim(); }
function helperFormatter258(text) { return String(text || "").trim(); }
function helperFormatter259(text) { return String(text || "").trim(); }
function helperFormatter260(text) { return String(text || "").trim(); }
boot();
