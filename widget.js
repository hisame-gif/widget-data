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
