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

function getDaysInMonth(year, month) {
  const date = new Date(year, month - 1, 1);
  const days = [];
  while (date.getMonth() === month - 1) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const dayOfWeek = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
    days.push({ dateStr: `${yyyy}-${mm}-${dd}`, dayNum: date.getDate(), dayOfWeek });
    date.setDate(date.getDate() + 1);
  }
  return days;
}

function render() {
  const monthInput = $("#monthPicker");
  if (!monthInput || !monthInput.value) return;
  const [yearStr, monthStr] = monthInput.value.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const days = getDaysInMonth(year, month);

  const thead = $("#calendarHead");
  const tbody = $("#calendarBody");
  if (!thead || !tbody) return;

  thead.innerHTML = `<tr><th class="p-2 border bg-gray-100 text-center w-20 sticky left-0 z-10">枠</th>${days.map(d => `<th class="p-2 border text-center min-w-[100px] ${d.dayOfWeek === '土' ? 'bg-blue-50' : d.dayOfWeek === '日' ? 'bg-red-50' : 'bg-gray-50'}"><div>${d.dayNum}</div><div class="text-xs text-gray-500">(${d.dayOfWeek})</div></th>`).join("")}</tr>`;

  tbody.innerHTML = reservationSlots.map(slot => {
    const cells = days.map(d => {
      const match = reservations.find(r => r.date === d.dateStr && r.slot === slot);
      if (match) {
        return `<td class="p-1 border align-top h-24 cursor-pointer hover:bg-yellow-50 transition" onclick="openEditModal('${match.id}')">
          <div class="bg-indigo-100 p-1.5 rounded text-xs h-full flex flex-col justify-between shadow-sm">
            <div class="font-bold text-indigo-900 truncate">${match.name || "名称なし"}</div>
            <div class="text-gray-600 truncate">${match.time || ""}</div>
            <div class="text-gray-500 truncate">${match.plan || ""}</div>
          </div>
        </td>`;
      }
      return `<td class="p-1 border align-top h-24 hover:bg-gray-50 cursor-pointer" onclick="openNewModal('${d.dateStr}', '${slot}')"></td>`;
    }).join("");
    return `<tr><td class="p-2 border font-bold text-center bg-gray-50 sticky left-0 z-10 flex items-center justify-center">${slot}</td>${cells}</tr>`;
  }).join("");

  renderTotals();
}

function renderTotals() {
  const totalsEl = $("#monthlyTotals");
  if (!totalsEl) return;
  const totals = monthlyTotals();
  totalsEl.innerHTML = totals.map(([m, val]) => `<div class="flex justify-between py-1 border-b"><span>${m}</span><span class="font-bold">¥${val.toLocaleString()}</span></div>`).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  const monthPicker = $("#monthPicker");
  if (monthPicker && !monthPicker.value) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    monthPicker.value = `${yyyy}-${mm}`;
  }
  if (monthPicker) {
    monthPicker.addEventListener("change", render);
  }
  loadReservations();
});
