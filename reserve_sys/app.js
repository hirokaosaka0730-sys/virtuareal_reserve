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

async function saveReservations() {
    localStorage.setItem(storageKey, JSON.stringify(reservations));
    if (GAS_API_URL && !GAS_API_URL.includes("ここに")) {
        const statusEl = $("#parseHint");
        if (statusEl) statusEl.textContent = "スプレッドシートへ保存中...";
        try {
            await fetch(GAS_API_URL, {
                method: "POST",
                headers: { "Content-Type": "text/plain" },
                body: JSON.stringify(reservations)
            });
            if (statusEl) statusEl.textContent = "保存・同期が完了しました。";
        } catch (e) {
            console.error("GAS保存失敗:", e);
            if (statusEl) statusEl.textContent = "クラウド保存に失敗しました（ローカルのみ保存済）";
        }
    }
}

function yen(value) { return value ? `¥${Number(String(value).replace(/[^0-9]/g, "")).toLocaleString()}` : ""; }

function isoToday() { return new Date().toISOString().slice(0, 7); }

function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }

function amountNumber(value) { return Number(String(value || "").replace(/[^0-9]/g, "")) || 0; }

function hasFireOption(record) { return /アンティーク燭台3台[＋+].*着火|螺旋階段キャンドル(?:着火|点灯)|アンティークキャンドル点灯/.test(record.options || ""); }

function monthlyTotals() { return Object.entries(Object.groupBy(reservations, (r) => r.date ? .slice(0, 7) || "未設定")).map(([month, items]) => [month, items.reduce((sum, item) => sum + amountNumber(item.amount), 0)]).sort(([a], [b]) => a.localeCompare(b)); }

function nextAvailableSlot(date, omitId = "") { return reservationSlots.find((slot) => !reservations.some((record) => record.id !== omitId && record.date === date && record.slot === slot)) || reservationSlots.at(-1); }

function extract(text) {
    const normal = text.replace(/ /g, " ");
    const dateMatch = normal.match(/(?:ご予約日時|利用日|ご予約日)[^\n]*\n?\s*(?:[■\[【]?\s*)?(20\d{2})[年/.]\s*(\d{1,2})[月/.]\s*(\d{1,2})日?/) || normal.match(/(20\d{2})[年/.]\s*(\d{1,2})[月/.]\s*(\d{1,2})日?/);
    const fromForm = normal.match(/\[ご予約月\][\s\S]{0,80}?((?:20\d{2}年)?\s*\d{1,2})月[\s\S]{0,80}?\[ご予約日\][\s\S]{0,50}?(\d{1,2})日/);
    const now = new Date();
    const year = dateMatch ? .[1] || (fromForm ? .[1] ? .match(/20\d{2}/) ? .[0]) || String(now.getFullYear());
    const month = dateMatch ? .[2] || fromForm ? .[1] ? .match(/(\d{1,2})\s*$/) ? .[1];
    const day = dateMatch ? .[3] || fromForm ? .[2];
    const date = month && day ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
    const field = (name) => normal.match(new RegExp(`\\[${name}\\]\\s*\\n?([\\s\\S]*?)(?=\\n\\s*\\[|$)`)) ? .[1] ? .trim() || "";
    const firstLine = normal.split("\n").map((line) => line.trim().replace(/^[「\"]|[」\"]$/g, "")).find(Boolean) || "";
    const name = normal.match(/^\s*([^\n]{2,30}?)\s*様/m) ? .[1] ? .trim() || field("お名前\\(代表者\\)").split("\n")[0] || firstLine;
    const plan = normal.match(/■ご予約内容\s*\n([\s\S]*?)(?=\n\s*■|【合計|={3,})/) ? .[1] ? .trim() || field("ご希望プラン").split("\n")[0] || normal.match(/^.*プラン.*$/m) ? .[0] ? .trim() || "";
    const time = normal.match(/(?:ご予約日時|利用時間)[\s\S]{0,120}?((?:[01]?\d|2[0-3])[:時]\d{0,2}\s*(?:〜|～|\-|−|–)\s*(?:[01]?\d|2[0-3])[:時]\d{0,2})/) ? .[1] || field("平日ご利用[^\]]+").split("\n")[0] || "";
    const amount = normal.match(/(?:【\s*)?合計[：:]?\s*[￥¥]?\s*([\d,]+)/) ? .[1] || "";
    const optionLines = normal.split("\n").map((line) => line.trim()).filter((line) => /キャンドル|駐車場|シャンデリア/.test(line) && !/\[|ご希望|着火ご希望/.test(line));
    const options = normal.match(/■オプション追加\s*\n([\s\S]*?)(?=\n\s*【合計|\n\s*={3,}|\n\s*■)/) ? .[1] ? .replace(/・/g, "").trim() || field("オプション追加[^\]]*").replace(/\n+/g, "、") || optionLines.join("、");
    const slot = "予約1";
    return { id: crypto.randomUUID(), date, slot, customer: name, time, plan: plan.replace(/\n+/g, " "), amount: String(amount).replace(/,/g, ""), options, memo: "", sourceText: text };
}

function monthDate() { const [year, month] = $("#monthPicker").value.split("-").map(Number); return { year, month }; }

function render() {
    const { year, month } = monthDate();
    const days = new Date(year, month, 0).getDate();
    const currentMonth = `${year}-${String(month).padStart(2, "0")}`;
    const total = reservations.filter((r) => r.date ? .startsWith(currentMonth)).reduce((sum, item) => sum + amountNumber(item.amount), 0);
    $("#monthTotal").textContent = `${year}年${month}月の合計：${yen(total) || "¥0"}`;
    const grouped = Object.groupBy(reservations.filter((r) => r.date && r.date.startsWith(`${year}-${String(month).padStart(2, "0")}`)), (r) => `${r.date}:${r.slot}`);
    let html = "<thead><tr><th>予約 / 日付</th>";
    for (let day = 1; day <= days; day++) {
        const date = new Date(year, month - 1, day);
        const weekend = [0, 6].includes(date.getDay());
        html += `<th class="${weekend ? "weekend-head" : ""}"><span class="date-number">${day}</span>${["日","月","火","水","木","金","土"][date.getDay()]}</th>`;
    }
    html += "</tr></thead><tbody>";
    reservationSlots.forEach((slot) => {
        html += `<tr><th class="row-label">${slot}</th>`;
        for (let day = 1; day <= days; day++) {
            const iso = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const weekend = [0, 6].includes(new Date(iso + "T00:00:00").getDay());
            const entries = grouped[`${iso}:${slot}`] || [];
            html += `<td class="${weekend ? "weekend" : ""}" data-date="${iso}" data-slot="${slot}">${entries.length ? entries.map(card).join("") : '<span class="empty-cell">＋</span>'}</td>`;
        }
        html += "</tr>";
    });
    $("#scheduleTable").innerHTML = html + "</tbody>";
}

function card(r) { const fire = hasFireOption(r); const memo = r.memo ? .trim(); return `<article class="reservation-card ${fire ? "fire-option" : ""}"><button class="card-main" type="button" data-id="${r.id}"><strong class="card-name">${escapeHtml(r.customer || "お名前未入力")}</strong><span class="card-time">${escapeHtml(r.time || r.slot)}</span><span class="card-plan">${escapeHtml(r.plan || "予約内容を確認")}</span><span class="card-amount">${yen(r.amount)}</span>${memo ? `<span class="card-memo">備考：${escapeHtml(memo)}</span>` : ""}${fire ? '<span class="fire-badge">火気オプションあり</span>' : ""}</button></article>`; }
function openDialog(record = {}) { const form = $("#reservationForm"); editingId = record.id || null; form.reset(); for (const [key,value] of Object.entries(record)) { if (form.elements[key]) form.elements[key].value = value; } $("#dialogTitle").textContent = editingId ? "予約内容を編集" : "予約を手動追加"; $("#deleteReservation").hidden = !editingId; $("#reservationDialog").showModal(); }
async function persistFromForm() { const data = Object.fromEntries(new FormData($("#reservationForm"))); if (!data.date || !data.customer) return; if (editingId) reservations = reservations.map((r) => r.id === editingId ? { ...r, ...data } : r); else reservations.push({ id: crypto.randomUUID(), ...data }); render(); await saveReservations(); }

$("#monthPicker").value = isoToday();
loadReservations();

$("#parseReservation").addEventListener("click", async () => {
  const value = $("#reservationText").value.trim();
  if (!value) return;
  const parsed = extract(value);
  if (!parsed.date) {
    $("#parseHint").textContent = "利用日を読み取れませんでした。確認画面で日付を入力してください。";
    return openDialog(parsed);
  }
  parsed.slot = nextAvailableSlot(parsed.date);
  reservations.push(parsed);
  $("#monthPicker").value = parsed.date.slice(0, 7);
  $("#reservationText").value = "";
  render();
  await saveReservations();
});
$("#reservationForm").addEventListener("submit", async (event) => { if (event.submitter?.value === "cancel") return; event.preventDefault(); await persistFromForm(); $("#reservationDialog").close(); });
document.querySelectorAll("[data-dialog-cancel]").forEach((button) => button.addEventListener("click", () => $("#reservationDialog").close()));
$("#newReservation").addEventListener("click", () => { const date = `${$("#monthPicker").value}-01`; openDialog({ date, slot: nextAvailableSlot(date), sourceText:"" }); });
$("#scheduleTable").addEventListener("click", (event) => { const button = event.target.closest("[data-id]"); if (button) return openDialog(reservations.find((r) => r.id === button.dataset.id)); const cell = event.target.closest("td[data-date]"); if (cell) openDialog({ date: cell.dataset.date, slot: cell.dataset.slot }); });
$("#deleteReservation").addEventListener("click", async () => { reservations = reservations.filter((r) => r.id !== editingId); render(); $("#reservationDialog").close(); await saveReservations(); });
$("#monthPicker").addEventListener("change", render); ["previousMonth","nextMonth"].forEach((id) => $("#"+id).addEventListener("click", () => { const d = new Date($("#monthPicker").value + "-01T00:00:00"); d.setMonth(d.getMonth() + (id === "nextMonth" ? 1 : -1)); $("#monthPicker").value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; render(); }));
$("#downloadCsv").addEventListener("click", () => { const rows = [["利用日","枠","お名前","利用時間","プラン","合計金額","オプション","メモ"], ...reservations.map((r) => [r.date,r.slot,r.customer,r.time,r.plan,r.amount,r.options,r.memo]), [], ["月別合計","合計金額"], ...monthlyTotals().map(([month,total]) => [month, total])]; download("予約台帳.csv", "\uFEFF" + rows.map((row) => row.map((v) => `"${String(v||"").replaceAll('"','""')}"`).join(",")).join("\n"), "text/csv"); });
$("#downloadJson").addEventListener("click", () => download("予約台帳バックアップ.json", JSON.stringify(reservations, null, 2), "application/json"));
$("#restoreJson").addEventListener("change", async (event) => { const file = event.target.files[0]; if (!file) return; try { const imported = JSON.parse(await file.text()); if (!Array.isArray(imported)) throw new Error(); reservations = imported; render(); await saveReservations(); } catch { alert("予約データのJSONファイルを選択してください。"); } event.target.value = ""; });
function download(name, text, type) { const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement("a"); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); }
