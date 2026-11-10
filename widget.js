// ひさめの一日ウィジェット（大サイズ）
// Scriptable 用。データは GitHub の data.json を読みに行く。
// データ更新は甚太が GitHub 経由で行うので、このスクリプトは触らなくてOK。

const DATA_URL = "https://raw.githubusercontent.com/hisame-gif/widget-data/main/data.json";
const CACHE_NAME = "hisame-widget-cache.json";

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
  const target = `${key}T${String(hour).padStart(2, "0")}:00`;
  return hourly.time.indexOf(target);
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
  return { temp, hum, wind, prob, reasons, verdict, hard, caution: !hard && reasons.length > 0 };
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

// ---------- 次の予定を計算 ----------
function nextEvent(schedule) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (const item of schedule) {
    const [h, m] = item.time.split(":").map(Number);
    if (h * 60 + m >= nowMin) return item;
  }
  return null;
}

// ---------- ウィジェット組み立て ----------
async function buildWidget() {
  const data = await loadData();
  const w = new ListWidget();
  w.setPadding(14, 16, 12, 16);

  const bg = new LinearGradient();
  bg.colors = [new Color("#101623"), new Color("#1b2a4a")];
  bg.locations = [0, 1];
  w.backgroundGradient = bg;

  const WHITE = new Color("#ffffff");
  const SOFT = new Color("#c7d2e8");
  const ACCENT = new Color("#7dd3fc");
  const MEMO = new Color("#fda4af");

  // 上段：日付＋区分＋シフト
  const head = w.addStack();
  head.layoutHorizontally();
  const dateT = head.addText(`🗓 ${data.dateLabel}`);
  dateT.font = Font.boldSystemFont(16);
  dateT.textColor = WHITE;
  head.addSpacer();
  const typeT = head.addText(data.dayType + (data.shift ? `　${data.shift}` : ""));
  typeT.font = Font.systemFont(13);
  typeT.textColor = ACCENT;

  // アラート（遅延などがある時だけ表示）
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

  // 天気ストリップ（取れた時だけ表示）
  const weather = await loadWeather();
  if (weather && weather.daily) {
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
        ret.textColor = j.hard ? new Color("#fda4af") : (j.caution ? new Color("#fde68a") : new Color("#86efac"));
      }
    }
  }

  w.addSpacer(8);

  // 次の予定（大きく）
  const next = nextEvent(data.schedule || []);
  const nextLabel = w.addText("つぎの予定");
  nextLabel.font = Font.systemFont(11);
  nextLabel.textColor = SOFT;
  const nextT = w.addText(next ? `${next.time}　${next.label}` : "今日の予定はおわり🌙");
  nextT.font = Font.boldSystemFont(24);
  nextT.textColor = WHITE;

  w.addSpacer(8);

  // 中段：今日の流れ
  const flowTitle = w.addText("― 今日の流れ ―");
  flowTitle.font = Font.systemFont(11);
  flowTitle.textColor = SOFT;
  for (const item of (data.schedule || []).slice(0, 4)) {
    const row = w.addText(`${item.time}　${item.label}`);
    row.font = Font.systemFont(14);
    row.textColor = WHITE;
  }

  w.addSpacer(8);

  // 下段：メモと電車を左右に
  const bottom = w.addStack();
  bottom.layoutHorizontally();

  const memoCol = bottom.addStack();
  memoCol.layoutVertically();
  const memoTitle = memoCol.addText("📌 忘れ防止メモ");
  memoTitle.font = Font.boldSystemFont(12);
  memoTitle.textColor = MEMO;
  const memos = (data.memos || []).slice(0, 3);
  if (memos.length === 0) {
    const t = memoCol.addText("（なし）");
    t.font = Font.systemFont(12);
    t.textColor = SOFT;
  }
  for (const m of memos) {
    const t = memoCol.addText(`・${m}`);
    t.font = Font.systemFont(12);
    t.textColor = WHITE;
  }

  bottom.addSpacer();

  // 電車：平日／土日で自動切替（data.trains があればそちら優先）
  let train = data.train || null;
  if (data.trains) {
    const dow = new Date().getDay();
    train = (dow === 0 || dow === 6) ? data.trains.holiday : data.trains.weekday;
  }
  if (train) {
    const trainCol = bottom.addStack();
    trainCol.layoutVertically();
    const trainTitle = trainCol.addText(`🚃 ${train.title}`);
    trainTitle.font = Font.boldSystemFont(12);
    trainTitle.textColor = ACCENT;
    for (const line of train.lines || []) {
      const t = trainCol.addText(line);
      t.font = Font.systemFont(12);
      t.textColor = WHITE;
    }
  }

  // 15分後に再読み込みを促す
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  return w;
}

const widget = await buildWidget();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  widget.presentLarge();
}
Script.complete();
