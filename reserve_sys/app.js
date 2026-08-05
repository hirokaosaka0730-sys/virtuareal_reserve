const storageKey = "pds-reservations-v1";
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyzKRuCF8_nIiK22xRk3EIPi7roO9ZhegfzHbNoB-q1Hwvoabcg2Hn_yjiR4RT55bwH_w/exec";

const $ = (selector) => document.querySelector(selector);
const reservationSlots = ["予約1", "予約2", "予約3"];
let reservations = [];
let editingId = null;

// GASおよびローカルからのデータ読み込み
async function loadReservations() {
  const statusEl = $("#parseHint");
  if (statusEl) statusEl.textContent = "最新データを読み込み中...";
  try {
    if (GAS_API_URL) {
      const res = await fetch(GAS_API_URL);
      if (res.ok) {
        const data = await res.json();
        reservations = data.map((record) => ({
          ...record,
          slot: reservationSlots.includes(record.slot) ? record.slot : "予約1"
        }));
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
    reservations = (JSON.parse(localStorage.getItem(storageKey)) || []).map((record) => ({
      ...record,
      slot: reservationSlots.includes(record.slot) ? record.slot : "予約1"
    }));
  } catch {
    reservations = [];
  }
  if (statusEl) statusEl.textContent = "オフラインまたはローカルデータで動作中";
  render();
}

// 保存処理
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

// HTMLの #scheduleTable にカレンダーを描画する関数
function render() {
  const monthInput = $("#monthPicker");
  if (!monthInput || !monthInput.value) return;
  
  const [yearStr, monthStr] = monthInput.value.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const days = getDaysInMonth(year, month);

  const table = $("#scheduleTable");
  if (!table) return;

  // 月合計金額の計算と表示
  const currentMonthStr = `${yearStr}-${monthStr}`;
  const currentMonthReservations = reservations.filter(r => r.date && r.date.startsWith(currentMonthStr));
  const monthTotalAmount = currentMonthReservations.reduce((sum, r) => sum + amountNumber(r.amount), 0);
  const monthTotalEl = $("#monthTotal");
  if (monthTotalEl) {
    monthTotalEl.textContent = `${year}年${month}月 合計: ¥${monthTotalAmount.toLocaleString()}`;
  }

  // テーブルヘッダー（日付・曜日）の作成
  const headerHtml = `<thead><tr><th>枠</th>${days.map(d => 
    `<th class="${d.dayOfWeek === '土' ? 'sat' : d.dayOfWeek === '日' ? 'sun' : ''}">
      <div>${d.dayNum}</div>
      <div style="font-size: 0.75rem; font-weight: normal;">(${d.dayOfWeek})</div>
    </th>`
  ).join("")}</tr></thead>`;

  // テーブルボディ（予約枠×日付）の作成
  const bodyHtml = `<tbody>${reservationSlots.map(slot => {
    const cells = days.map(d => {
      const match = reservations.find(r => r.date === d.dateStr && r.slot === slot);
      if (match) {
        return `<td class="has-reservation" onclick="openEditModal('${match.id}')">
          <div class="reservation-card">
            <strong>${match.customer || match.name || "予約あり"}</strong>
            <div>${match.time || ""}</div>
            <div>${match.plan || ""}</div>
            <div>${match.amount ? '¥' + amountNumber(match.amount).toLocaleString() : ''}</div>
          </div>
        </td>`;
      }
      return `<td class="empty-cell" onclick="openNewModal('${d.dateStr}', '${slot}')"></td>`;
    }).join("");
    return `<tr><th>${slot}</th>${cells}</tr>`;
  }).join("")}</tbody>`;

  table.innerHTML = headerHtml + bodyHtml;
}

// 前月・翌月移動
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

// 新規作成モーダルを開く
window.openNewModal = function(dateStr, slotStr) {
  editingId = null;
  const form = $("#reservationForm");
  if (!form) return;
  form.reset();
  if (form.elements["date"]) form.elements["date"].value = dateStr;
  if (form.elements["slot"]) form.elements["slot"].value = slotStr;
  const dialog = $("#reservationDialog");
  if (dialog && dialog.showModal) dialog.showModal();
};

// 編集モーダルを開く
window.openEditModal = function(id) {
  editingId = id;
  const item = reservations.find(r => r.id === id);
  if (!item) return;
  const form = $("#reservationForm");
  if (!form) return;
  form.reset();
  if (form.elements["date"]) form.elements["date"].value = item.date || "";
  if (form.elements["slot"]) form.elements["slot"].value = item.slot || "予約1";
  if (form.elements["customer"]) form.elements["customer"].value = item.customer || item.name || "";
  if (form.elements["time"]) form.elements["time"].value = item.time || "";
  if (form.elements["plan"]) form.elements["plan"].value = item.plan || "";
  if (form.elements["amount"]) form.elements["amount"].value = item.amount || "";
  if (form.elements["options"]) form.elements["options"].value = item.options || "";
  if (form.elements["memo"]) form.elements["memo"].value = item.memo || "";
  if (form.elements["sourceText"]) form.elements["sourceText"].value = item.sourceText || "";

  const dialog = $("#reservationDialog");
  if (dialog && dialog.showModal) dialog.showModal();
};

// 初期化とイベント設定
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

  const newBtn = $("#newReservation");
  if (newBtn) {
    newBtn.addEventListener("click", () => {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      openNewModal(`${yyyy}-${mm}-${dd}`, "予約1");
    });
  }

  // ダイアログキャンセル・閉じる処理
  document.querySelectorAll("[data-dialog-cancel]").forEach(btn => {
    btn.addEventListener("click", () => {
      const dialog = $("#reservationDialog");
      if (dialog && dialog.close) dialog.close();
    });
  });

  // フォーム送信（保存）
  const form = $("#reservationForm");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const dataObj = {
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
      };

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
