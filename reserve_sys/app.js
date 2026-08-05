const storageKey = "pds-reservations-v1";
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyzKRuCF8_nIiK22xRk3EIPi7roO9ZhegfzHbNoB-q1Hwvoabcg2Hn_yjiR4RT55bwH_w/exec";

const $ = (selector) => document.querySelector(selector);
const reservationSlots = ["予約1", "予約2", "予約3"];
let reservations = [];
let editingId = null;

// 日付形式の統一化 (2026/8/1, 2026年8月1日 -> 2026-08-01)
function normalizeDateStr(dateStr) {
  if (!dateStr) return "";
  const match = String(dateStr).match(/(\d{4})[^\d]?(\d{1,2})[^\d]?(\d{1,2})/);
  if (match) {
    const [_, y, m, d] = match;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return String(dateStr).trim();
}

// データオブジェクトの正規化（スプシ・ローカルからの差分吸収）
function normalizeRecord(record) {
  const dateRaw = record.date || record.利用日 || record.日付 || "";
  return {
    id: record.id || "id_" + Math.random().toString(36).substring(2, 9),
    date: normalizeDateStr(dateRaw),
    slot: reservationSlots.includes(record.slot || record.予約枠 || record.枠) ? (record.slot || record.予約枠 || record.枠) : "予約1",
    customer: record.customer || record.name || record.お名前 || record.氏名 || record.代表者名 || "予約あり",
    time: record.time || record.利用時間 || record.時間 || "",
    plan: record.plan || record.プラン || "",
    amount: record.amount || record.合計金額 || record.金額 || "",
    options: record.options || record.オプション || "",
    memo: record.memo || record.メモ || "",
    sourceText: record.sourceText || record.本文 || ""
  };
}

// データ取得 (GAS / LocalStorage)
async function loadReservations() {
  const statusEl = $("#parseHint");
  try {
    if (GAS_API_URL) {
      const res = await fetch(GAS_API_URL);
      if (res.ok) {
        const data = await res.json();
        reservations = Array.isArray(data) ? data.map(normalizeRecord) : [];
        localStorage.setItem(storageKey, JSON.stringify(reservations));
        if (statusEl) statusEl.textContent = "スプレッドシートと同期しました。";
        render();
        return;
      }
    }
  } catch (e) {
    console.warn("GAS取得失敗:", e);
  }
  try {
    const local = JSON.parse(localStorage.getItem(storageKey)) || [];
    reservations = local.map(normalizeRecord);
  } catch {
    reservations = [];
  }
  if (statusEl) statusEl.textContent = "日付・氏名・時間・プラン・金額・オプションを自動抽出し、空いている予約番号へ配置します。";
  render();
}

// データ保存 (GAS / LocalStorage)
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

// カレンダー表示処理
function render() {
  const monthInput = $("#monthPicker");
  if (!monthInput || !monthInput.value) return;
  
  const [yearStr, monthStr] = monthInput.value.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const days = getDaysInMonth(year, month);

  const table = $("#scheduleTable");
  if (!table) return;

  const currentMonthStr = `${yearStr}-${monthStr}`;
  const currentMonthReservations = reservations.filter(r => r.date && r.date.startsWith(currentMonthStr));
  const monthTotalAmount = currentMonthReservations.reduce((sum, r) => sum + amountNumber(r.amount), 0);
  const monthTotalEl = $("#monthTotal");
  if (monthTotalEl) {
    monthTotalEl.textContent = `${year}年${month}月 合計: ¥${monthTotalAmount.toLocaleString()}`;
  }

  const headerHtml = `<thead><tr><th>枠</th>${days.map(d => 
    `<th class="${d.dayOfWeek === '土' ? 'sat' : d.dayOfWeek === '日' ? 'sun' : ''}">
      <div>${d.dayNum}</div>
      <div style="font-size: 0.75rem; font-weight: normal;">(${d.dayOfWeek})</div>
    </th>`
  ).join("")}</tr></thead>`;

  const bodyHtml = `<tbody>${reservationSlots.map(slot => {
    const cells = days.map(d => {
      const match = reservations.find(r => r.date === d.dateStr && r.slot === slot);
      if (match) {
        return `<td class="has-reservation" onclick="openEditModal('${match.id}')">
          <div class="reservation-card">
            <strong class="card-name">${match.customer}</strong>
            <span class="card-time">${match.time}</span>
            <span class="card-plan">${match.plan}</span>
            <span class="card-amount">${match.amount ? '¥' + amountNumber(match.amount).toLocaleString() : ''}</span>
          </div>
        </td>`;
      }
      return `<td class="empty-cell" onclick="openNewModal('${d.dateStr}', '${slot}')"></td>`;
    }).join("");
    return `<tr><th>${slot}</th>${cells}</tr>`;
  }).join("")}</tbody>`;

  table.innerHTML = headerHtml + bodyHtml;
}

function changeMonth(delta) {
  const monthPicker = $("#monthPicker");
  if (!monthPicker || !monthPicker.value) return;
  const [y, m] = monthPicker.value.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  monthPicker.value = `${yyyy}-${mm}`;
  render();
}

// --- 高精度メール本文解析ロジック ---
function parseReservationText(text) {
  if (!text) return null;

  // 日付の解析
  let date = "";
  const dateMatch = text.match(/(?:利用日時?|ご予約日時?|日時?|利用日)[:：\s]*.*?(\d{4})[年\/.-](\d{1,2})[月\/.-](\d{1,2})/i) ||
                    text.match(/(\d{4})[年\/.-](\d{1,2})[月\/.-](\d{1,2})/);
  if (dateMatch) {
    date = `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`;
  } else {
    const today = new Date();
    date = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  }

  // お名前の解析
  let customer = "";
  const nameMatch = text.match(/(?:代表者氏名|代表者名|お名前|氏名|ご予約者)[:：\s]*([^\n\r]+)/i);
  if (nameMatch) {
    customer = nameMatch[1].replace(/様|さん/g, "").trim();
  }

  // 時間の解析
  let time = "";
  const timeMatch = text.match(/(?:利用時間|時間)[:：\s]*([^\n\r]+)/i) ||
                    text.match(/(\d{1,2}[:：]\d{2}\s*〜\s*\d{1,2}[:：]\d{2})/);
  if (timeMatch) {
    time = timeMatch[1].trim();
  }

  // プランの解析
  let plan = "";
  const planMatch = text.match(/(?:ご利用プラン|プラン|コース)[:：\s]*([^\n\r]+)/i);
  if (planMatch) {
    plan = planMatch[1].trim();
  }

  // 金額の解析
  let amount = "";
  const amountMatch = text.match(/(?:合計金額|請求金額|金額|利用料金)[:：\s]*[¥￥]?([\d,]+)/i);
  if (amountMatch) {
    amount = amountMatch[1].replace(/,/g, "");
  }

  // 空いている予約枠（予約1〜3）を自動設定
  let slot = "予約1";
  if (date) {
    const usedSlots = reservations.filter(r => r.date === date).map(r => r.slot);
    const available = reservationSlots.find(s => !usedSlots.includes(s));
    if (available) slot = available;
  }

  return { date, slot, customer, time, plan, amount, options: "", memo: "", sourceText: text };
}

// モーダル操作
window.openNewModal = function(dateStr, slotStr, initialData = {}) {
  editingId = null;
  const form = $("#reservationForm");
  if (!form) return;
  form.reset();
  if (form.elements["date"]) form.elements["date"].value = initialData.date || dateStr || "";
  if (form.elements["slot"]) form.elements["slot"].value = initialData.slot || slotStr || "予約1";
  if (form.elements["customer"]) form.elements["customer"].value = initialData.customer || "";
  if (form.elements["time"]) form.elements["time"].value = initialData.time || "";
  if (form.elements["plan"]) form.elements["plan"].value = initialData.plan || "";
  if (form.elements["amount"]) form.elements["amount"].value = initialData.amount || "";
  if (form.elements["options"]) form.elements["options"].value = initialData.options || "";
  if (form.elements["memo"]) form.elements["memo"].value = initialData.memo || "";
  if (form.elements["sourceText"]) form.elements["sourceText"].value = initialData.sourceText || "";

  const dialog = $("#reservationDialog");
  if (dialog && dialog.showModal) dialog.showModal();
};

window.openEditModal = function(id) {
  editingId = id;
  const item = reservations.find(r => r.id === id);
  if (!item) return;
  const form = $("#reservationForm");
  if (!form) return;
  form.reset();
  if (form.elements["date"]) form.elements["date"].value = item.date || "";
  if (form.elements["slot"]) form.elements["slot"].value = item.slot || "予約1";
  if (form.elements["customer"]) form.elements["customer"].value = item.customer || "";
  if (form.elements["time"]) form.elements["time"].value = item.time || "";
  if (form.elements["plan"]) form.elements["plan"].value = item.plan || "";
  if (form.elements["amount"]) form.elements["amount"].value = item.amount || "";
  if (form.elements["options"]) form.elements["options"].value = item.options || "";
  if (form.elements["memo"]) form.elements["memo"].value = item.memo || "";
  if (form.elements["sourceText"]) form.elements["sourceText"].value = item.sourceText || "";

  const dialog = $("#reservationDialog");
  if (dialog && dialog.showModal) dialog.showModal();
};

document.addEventListener("DOMContentLoaded", () => {
  const monthPicker = $("#monthPicker");
  if (monthPicker && !monthPicker.value) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    monthPicker.value = `${yyyy}-${mm}`;
  }
  if (monthPicker) monthPicker.addEventListener("change", render);

  const prevBtn = $("#previousMonth");
  if (prevBtn) prevBtn.addEventListener("click", () => changeMonth(-1));

  const nextBtn = $("#nextMonth");
  if (nextBtn) nextBtn.addEventListener("click", () => changeMonth(1));

  // メール読み取り「内容を確認する」ボタン処理
  const parseBtn = $("#parseReservation");
  if (parseBtn) {
    parseBtn.addEventListener("click", () => {
      const text = $("#reservationText")?.value;
      if (!text || !text.trim()) {
        alert("予約メールの本文を貼り付けてから「内容を確認する」を押してください。");
        return;
      }
      const parsed = parseReservationText(text);
      openNewModal(parsed.date, parsed.slot, parsed);
    });
  }

  // ダイアログ閉じるボタン
  document.querySelectorAll("[data-dialog-cancel]").forEach(btn => {
    btn.addEventListener("click", () => {
      const dialog = $("#reservationDialog");
      if (dialog && dialog.close) dialog.close();
    });
  });

  // フォーム保存（保存ボタン）
  const form = $("#reservationForm");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const dataObj = normalizeRecord({
        id: editingId || "id_" + Date.now(),
        date: formData.get("date"),
        slot: formData.get("slot"),
        customer: formData.get("customer"),
        time: formData.get("time"),
        plan: formData.get("plan"),
        amount: formData.get("amount"),
        options: formData.get("options"),
        memo: formData.get("memo"),
        sourceText: formData.get("sourceText")
      });

      if (editingId) {
        const idx = reservations.findIndex(r => r.id === editingId);
        if (idx !== -1) reservations[idx] = dataObj;
      } else {
        reservations.push(dataObj);
      }

      saveReservations();
      render();
      const dialog = $("#reservationDialog");
      if (dialog && dialog.close) dialog.close();
    });
  }

  // 削除ボタン
  const delBtn = $("#deleteReservation");
  if (delBtn) {
    delBtn.addEventListener("click", () => {
      if (!editingId) return;
      if (confirm("この予約を削除してもよろしいですか？")) {
        reservations = reservations.filter(r => r.id !== editingId);
        saveReservations();
        render();
        const dialog = $("#reservationDialog");
        if (dialog && dialog.close) dialog.close();
      }
    });
  }

  loadReservations();
});
