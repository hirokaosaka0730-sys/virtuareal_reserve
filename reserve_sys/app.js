const storageKey = "pds-reservations-v1";
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyzKRuCF8_nIiK22xRk3EIPi7roO9ZhegfzHbNoB-q1Hwvoabcg2Hn_yjiR4RT55bwH_w/exec";

const $ = (selector) => document.querySelector(selector);
const reservationSlots = ["予約1", "予約2", "予約3"];
let reservations = [];
let editingId = null;

async function loadReservations() {
  const statusEl = $("#parseHint");
  if (statusEl) statusEl.textContent = "最新データを読み込み中...";
  try {
    if (GAS_API_URL) {
      const res = await fetch(GAS_API_URL);
      if (res.ok) {
        const data = await res.json();
        reservations = data.map((record) => ({...record, slot: reservationSlots.includes(record.slot) ? record.slot : "予約1" }));
        localStorage.setItem(storageKey, JSON.stringify(reservations));
        if (statusEl) statusEl.textContent = "スプレッドシートと同期しました。";
        render();
        return;
      }
    }
  } catch (e) {
    console.warn("GAS取得失敗。ローカルデータを使用します:", e);
  }
  try {
    reservations = (JSON.parse(localStorage.getItem(storageKey)) || []).map((record) => ({...record, slot: reservationSlots.includes(record.slot) ? record.slot : "予約1" }));
  } catch {
    reservations = [];
  }
  if (statusEl) statusEl.textContent = "オフラインまたはローカルデータで動作中";
  render();
}

function saveReservations() {
  localStorage.setItem(storageKey, JSON.stringify(reservations));
  if (GAS_API_URL) {
    fetch(GAS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(reservations)
    }).catch((e) => console.warn("GAS保存失敗:", e));
  }
}

function amountNumber(val) {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const num = parseInt(String(val).replace(/[^0-9]/g, ""), 10);
  return isNaN(num) ? 0 : num;
}

function monthlyTotals() {
  return Object.entries(
    Object.groupBy(reservations, (r) => r.date?.slice(0, 7) || "未設定")
  ).map(([month, items]) => [
    month,
    items.reduce((sum, item) => sum + amountNumber(item.amount), 0)
  ]).sort(([a], [b]) => a.localeCompare(b));
}
