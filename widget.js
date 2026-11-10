// ひさめのウィジェット v5（2個置き対応）
// 大サイズ：一日の流れ（予定・天気・電車）
// 中サイズ：Muse週間使用量リング
// 小サイズ：次の予定ミニ
// データは GitHub の data.json から。使用量は甚太が定期更新する。

const DATA_URL = "https://raw.githubusercontent.com/hisame-gif/widget-data/main/data.json";
const CACHE_NAME = "hisame-widget-cache.json";

const WHITE = new Color("#ffffff");
const SOFT = new Color("#c7d2e8");
const ACCENT = new Color("#7dd3fc");
const PINK = new Color("#fda4af");
const YELLOW = new Color("#fde68a");
const GREEN = new Color("#86efac");
const TRACK = new Color("#334155");

// ---------- データ取得（失敗したら前回キャッシュ） ----------
async function loadData() {
  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.documentsDirectory(), CACHE_NAME);
  try {
    const req = new Request(DATA_URL);
    req.timeoutInterval = 10;
    const data = await req.loadJSON();
    fm.writeString(cachePath, JSON.stringify(data));
    return data;
  } catch (e) {
    if (fm.fileExists(cachePath)) {
      return JSON.parse(fm.readString(cachePath));
    }
    throw e;
  }
}

// ---------- 天気（Open-Meteo、板橋区） ----------
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=35.766&longitude=139.709&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation_probability&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&timezone=Asia%2FTokyo&forecast_days=2&wind_speed_unit=ms";

function weatherLabel(code) {
  if (code === 0) return "☀️ 晴れ";
  if (code <= 2) return "⛅ 晴れ時々くもり";
  if (code === 3) return "☁️ くもり";
  if (code === 45 || code === 48) return "🌫 霧";
  if (code >= 51 && code <= 57) return "🌦 霧雨";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "🌧 雨";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "🌨 雪";
  if (code >= 95) return "⛈ 雷雨";
  return "☁️ くもり";
}

function dateKey(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function hourIndex(hourly, key, hour) {
  return hourly.time.indexOf(`${key}T${String(hour).padStart(2, "0")}:00`);
}

// 帰り（23時台）の判定。お嬢ルール：風4m以上は注意、湿度65%以上＆15度以上はじめっと暑い、雨は電車。
function judgeWalkHome(w) {
  const idx23 = hourIndex(w.hourly, dateKey(new Date()), 23);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const idx00 = hourIndex(w.hourly, dateKey(tomorrow), 0);
  const idxs = [idx23, idx00].filter((i) => i >= 0);
  if (idxs.length === 0) return null;
  let wind = 0, prob = 0;
  for (const i of idxs) {
    wind = Math.max(wind, w.hourly.wind_speed_10m[i] ?? 0);
    prob = Math.max(prob, w.hourly.precipitation_probability[i] ?? 0);
  }
  const temp = w.hourly.temperature_2m[idx23];
  const hum = w.hourly.relative_humidity_2m[idx23];
  const reasons = [];
  let hard = false;
  if (prob >= 50) { hard = true; reasons.push("雨の予報"); }
  if (wind >= 8) { hard = true; reasons.push("風が強い"); }
  else if (wind >= 4) { reasons.push("風4m以上で注意"); }
  if (hum >= 65 && temp >= 15) { reasons.push("じめっと暑いかも"); }
  const verdict = hard ? "電車が無難" : (reasons.length ? "注意して歩ける" : "歩いて帰れる◎");
  return { temp, hum, wind, reasons, verdict, hard, caution: !hard && reasons.length > 0 };
}

async function loadWeather() {
  try {
    const req = new Request(WEATHER_URL);
    req.timeoutInterval = 10;
    return await req.loadJSON();
  } catch (e) {
    return null;
  }
}

// ---------- 次の予定 ----------
function nextEvent(schedule) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (const item of schedule || []) {
    const [h, m] = item.time.split(":").map(Number);
    if (h * 60 + m >= nowMin) return item;
  }
  return null;
}

// ---------- 使用量リング画像 ----------
function ringImage(percent) {
  const size = 132;
  const ctx = new DrawContext();
  ctx.size = new Size(size, size);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const cx = size / 2, cy = size / 2, r = size / 2 - 10;
  const arcPath = (fromDeg, toDeg) => {
    const p = new Path();
    const steps = Math.max(2, Math.ceil((toDeg - fromDeg) / 3));
    for (let i = 0; i <= steps; i++) {
      const a = ((fromDeg + (toDeg - fromDeg) * (i / steps)) * Math.PI) / 180;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      if (i === 0) p.move(new Point(x, y)); else p.addLine(new Point(x, y));
    }
    return p;
  };
  ctx.setLineWidth(13);
  ctx.setStrokeColor(TRACK);
  ctx.addPath(arcPath(0, 360));
  ctx.strokePath();
  const pct = Math.max(0, Math.min(100, percent));
  if (pct > 0) {
    ctx.setStrokeColor(pct >= 80 ? PINK : pct >= 50 ? YELLOW : ACCENT);
    ctx.addPath(arcPath(-90, -90 + pct * 3.6));
    ctx.strokePath();
  }
  return ctx.getImage();
}

function bgGradient(w) {
  const bg = new LinearGradient();
  bg.colors = [new Color("#101623"), new Color("#1b2a4a")];
  bg.locations = [0, 1];
  w.backgroundGradient = bg;
  return w;
}

// ---------- 大サイズ：一日の流れ ----------
async function buildLarge(data) {
  const w = bgGradient(new ListWidget());
  w.setPadding(14, 16, 12, 16);

  const head = w.addStack();
  head.layoutHorizontally();
  const dateT = head.addText(`🗓 ${data.dateLabel}`);
  dateT.font = Font.boldSystemFont(16);
  dateT.textColor = WHITE;
  head.addSpacer();
  const typeT = head.addText(data.dayType + (data.shift ? `　${data.shift}` : ""));
  typeT.font = Font.systemFont(13);
  typeT.textColor = ACCENT;

  if (data.alert) {
    w.addSpacer(6);
    const alertStack = w.addStack();
    alertStack.backgroundColor = new Color("#7f1d2e", 0.9);
    alertStack.cornerRadius = 8;
    alertStack.setPadding(6, 8, 6, 8);
    const aT = alertStack.addText(`⚠️ ${data.alert}`);
    aT.font = Font.boldSystemFont(13);
    aT.textColor = new Color("#fecdd3");
  }

  const weather = await loadWeather();
  if (weather && weather.daily) {
    w.addSpacer(6);
    const d = weather.daily;
    const wLine = w.addText(`${weatherLabel(d.weather_code[0])}　最高 ${Math.round(d.temperature_2m_max[0])}° / 最低 ${Math.round(d.temperature_2m_min[0])}°　☂️ ${d.precipitation_probability_max[0] ?? 0}%`);
    wLine.font = Font.systemFont(12);
    wLine.textColor = SOFT;
    if (data.shift) {
      const j = judgeWalkHome(weather);
      if (j) {
        const note = j.reasons.length ? `（${j.reasons.join("・")}）` : "";
        const ret = w.addText(`帰り23時 ${Math.round(j.temp)}° 湿度${Math.round(j.hum)}% 風${j.wind.toFixed(0)}m → ${j.verdict}${note}`);
        ret.font = Font.boldSystemFont(12);
        ret.textColor = j.hard ? PINK : (j.caution ? YELLOW : GREEN);
      }
    }
  }

  w.addSpacer(8);
  const nextLabel = w.addText("つぎの予定");
  nextLabel.font = Font.systemFont(11);
  nextLabel.textColor = SOFT;
  const next = nextEvent(data.schedule);
  const nextT = w.addText(next ? `${next.time}　${next.label}` : "今日の予定はおわり🌙");
  nextT.font = Font.boldSystemFont(24);
  nextT.textColor = WHITE;

  w.addSpacer(8);
  const flowTitle = w.addText("― 今日の流れ ―");
  flowTitle.font = Font.systemFont(11);
  flowTitle.textColor = SOFT;
  for (const item of (data.schedule || []).slice(0, 4)) {
    const row = w.addText(`${item.time}　${item.label}`);
    row.font = Font.systemFont(14);
    row.textColor = WHITE;
  }

  let train = data.train || null;
  if (data.trains) {
    const dow = new Date().getDay();
    train = (dow === 0 || dow === 6) ? data.trains.holiday : data.trains.weekday;
  }
  if (train) {
    w.addSpacer(8);
    const trainTitle = w.addText(`🚃 ${train.title}`);
    trainTitle.font = Font.boldSystemFont(12);
    trainTitle.textColor = ACCENT;
    for (const line of train.lines || []) {
      const t = w.addText(line);
      t.font = Font.systemFont(13);
      t.textColor = WHITE;
    }
  }

  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  return w;
}

// ---------- 中サイズ：Muse週間使用量 ----------
function buildMedium(data) {
  const w = bgGradient(new ListWidget());
  w.setPadding(12, 14, 12, 14);
  const usage = data.usage || { percent: 0, resetLabel: "", updated: "" };

  const row = w.addStack();
  row.layoutHorizontally();

  const ringStack = row.addStack();
  const img = ringStack.addImage(ringImage(usage.percent));
  img.imageSize = new Size(104, 104);

  row.addSpacer(10);

  const col = row.addStack();
  col.layoutVertically();
  const title = col.addText("Muse 週間使用量");
  title.font = Font.boldSystemFont(13);
  title.textColor = SOFT;
  const pct = col.addText(`${usage.percent}%`);
  pct.font = Font.boldSystemFont(34);
  pct.textColor = usage.percent >= 80 ? PINK : usage.percent >= 50 ? YELLOW : WHITE;
  if (usage.resetLabel) {
    const rs = col.addText(usage.resetLabel);
    rs.font = Font.systemFont(12);
    rs.textColor = ACCENT;
  }
  if (usage.updated) {
    const up = col.addText(`更新 ${usage.updated}`);
    up.font = Font.systemFont(10);
    up.textColor = SOFT;
  }

  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  return w;
}

// ---------- 小サイズ：次の予定ミニ ----------
function buildSmall(data) {
  const w = bgGradient(new ListWidget());
  w.setPadding(12, 12, 12, 12);
  const d = w.addText(data.dateLabel);
  d.font = Font.boldSystemFont(13);
  d.textColor = ACCENT;
  w.addSpacer(6);
  const next = nextEvent(data.schedule);
  const t1 = w.addText("つぎの予定");
  t1.font = Font.systemFont(10);
  t1.textColor = SOFT;
  const t2 = w.addText(next ? `${next.time}\n${next.label}` : "おわり🌙");
  t2.font = Font.boldSystemFont(17);
  t2.textColor = WHITE;
  if (data.usage) {
    w.addSpacer(6);
    const u = w.addText(`Muse ${data.usage.percent}%`);
    u.font = Font.systemFont(11);
    u.textColor = SOFT;
  }
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  return w;
}

// ---------- メイン ----------
const data = await loadData();
const family = config.widgetFamily || "large";
let widget;
if (family === "medium") widget = buildMedium(data);
else if (family === "small") widget = buildSmall(data);
else widget = await buildLarge(data);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  widget.presentLarge();
}
Script.complete();
