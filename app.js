// ============================================================
//  PILATES MANAGER - Frontend
//  Berkomunikasi dengan Vercel function: POST /api
// ============================================================

const state = { klien: [], sesi: [], paket: [], pembayaran: [], trend: [] };
let trendChart = null;

// ---------- API ----------
async function api(action, data = {}) {
  const res = await fetch("/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...data }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || "Server error (" + res.status + ")");
  return json;
}

// ---------- Status ----------
function showStatus(msg, isErr = false) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = "show " + (isErr ? "err" : "ok");
  setTimeout(() => { el.className = ""; }, 3000);
}

// ---------- Tabs ----------
document.getElementById("nav").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  document.querySelectorAll("#nav button").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll(".tab").forEach(t => t.classList.add("hidden"));
  document.getElementById("tab-" + btn.dataset.tab).classList.remove("hidden");
});

// ---------- Render helpers ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rupiah = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID");
const fmtDate = (s) => s ? s.split("-").reverse().join("/") : "-";

function paketNama(id) {
  const p = state.paket.find(x => String(x.id) === String(id));
  return p ? p.nama : "-";
}

function fillPaketSelect() {
  document.getElementById("klien-paketId").innerHTML =
    '<option value="">Tanpa Paket</option>' +
    state.paket.map(p => `<option value="${p.id}">${esc(p.nama)}</option>`).join("");
}

function fillPaySelect() {
  document.getElementById("pay-klienId").innerHTML =
    '<option value="">Pilih Klien</option>' +
    state.klien.map(k => `<option value="${k.id}">${esc(k.nama)}</option>`).join("");
}

// ---------- Dashboard ----------
async function renderDashboard() {
  const d = await api("getDashboard");
  document.getElementById("d-totalKlien").textContent = d.totalKlien;
  document.getElementById("d-klienAktif").textContent = d.klienAktif;
  document.getElementById("d-sesiHariIni").textContent = d.sesiHariIni;
  document.getElementById("d-pemasukanBulanIni").textContent = rupiah(d.pemasukanBulanIni);
  const list = document.getElementById("d-sesiList");
  if (!d.sesiHariIniList.length) {
    list.innerHTML = '<p>Tidak ada sesi hari ini.</p>';
  } else {
    list.innerHTML = d.sesiHariIniList.map(s =>
      `<p><b>${esc(s.kelas)}</b> — ${esc(s.waktu)} — ${esc(s.instruktur)} (${s.klienList ? s.klienList.split(",").length : 0}/${s.kuota})</p>`).join("");
  }
}

// ---------- Klien ----------
function renderKlien() {
  const tbody = document.querySelector("#tbl-klien tbody");
  document.querySelector("#tbl-klien thead").innerHTML =
    "<tr><th>Nama</th><th>No HP</th><th>Email</th><th>Paket</th><th>Sisa Sesi</th><th>Gabung</th><th></th></tr>";
  tbody.innerHTML = state.klien.map(k => `
    <tr>
      <td>${esc(k.nama)}</td><td>${esc(k.noHP)}</td><td>${esc(k.email)}</td>
      <td>${paketNama(k.paketId)}</td><td>${k.sisaSesi}</td><td>${fmtDate(k.joinDate)}</td>
      <td>
        <button class="edit" onclick="editKlien(${k.id})">Edit</button>
        <button onclick="deleteKlien(${k.id})">Hapus</button>
      </td>
    </tr>`).join("");
}

document.getElementById("form-klien").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("saveKlien", {
      id: document.getElementById("klien-id").value,
      nama: document.getElementById("klien-nama").value,
      noHP: document.getElementById("klien-noHP").value,
      email: document.getElementById("klien-email").value,
      paketId: document.getElementById("klien-paketId").value,
      sisaSesi: document.getElementById("klien-sisaSesi").value,
    });
    hideForm("klien");
    showStatus("Klien disimpan");
    await loadAll();
  } catch (err) { showStatus(err.message, true); }
});

function hideForm(name) {
  document.getElementById("form-" + name).classList.add("hidden");
  document.getElementById("form-" + name).reset();
}

function editKlien(id) {
  const k = state.klien.find(x => String(x.id) === String(id));
  document.getElementById("klien-id").value = k.id;
  document.getElementById("klien-nama").value = k.nama;
  document.getElementById("klien-noHP").value = k.noHP || "";
  document.getElementById("klien-email").value = k.email || "";
  document.getElementById("klien-paketId").value = k.paketId || "";
  document.getElementById("klien-sisaSesi").value = k.sisaSesi;
  showForm("klien");
}

async function deleteKlien(id) {
  if (!confirm("Hapus klien ini?")) return;
  try {
    await api("deleteKlien", { id });
    showStatus("Klien dihapus");
    await loadAll();
  } catch (err) { showStatus(err.message, true); }
}

// ---------- Sesi ----------
function renderSesi() {
  const tbody = document.querySelector("#tbl-sesi tbody");
  document.querySelector("#tbl-sesi thead").innerHTML =
    "<tr><th>Tanggal</th><th>Waktu</th><th>Kelas</th><th>Instruktur</th><th>Kuota</th><th>Terisi</th><th></th></tr>";
  tbody.innerHTML = state.sesi.map(s => `
    <tr>
      <td>${fmtDate(s.tanggal)}</td><td>${esc(s.waktu)}</td><td>${esc(s.kelas)}</td>
      <td>${esc(s.instruktur)}</td><td>${s.kuota}</td>
      <td>${s.klienList ? s.klienList.split(",").length : 0}</td>
      <td>
        <button class="att" onclick="openCheckin(${s.id})">Absensi</button>
        <button class="edit" onclick="editSesi(${s.id})">Edit</button>
        <button onclick="deleteSesi(${s.id})">Hapus</button>
      </td>
    </tr>`).join("");
}

document.getElementById("form-sesi").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("saveSesi", {
      id: document.getElementById("sesi-id").value,
      tanggal: document.getElementById("sesi-tanggal").value,
      waktu: document.getElementById("sesi-waktu").value,
      kelas: document.getElementById("sesi-kelas").value,
      instruktur: document.getElementById("sesi-instruktur").value,
      kuota: document.getElementById("sesi-kuota").value,
    });
    hideForm("sesi");
    showStatus("Sesi disimpan");
    await loadAll();
  } catch (err) { showStatus(err.message, true); }
});

function editSesi(id) {
  const s = state.sesi.find(x => String(x.id) === String(id));
  document.getElementById("sesi-id").value = s.id;
  document.getElementById("sesi-tanggal").value = s.tanggal;
  document.getElementById("sesi-waktu").value = s.waktu || "";
  document.getElementById("sesi-kelas").value = s.kelas || "";
  document.getElementById("sesi-instruktur").value = s.instruktur || "";
  document.getElementById("sesi-kuota").value = s.kuota;
  showForm("sesi");
}

async function deleteSesi(id) {
  if (!confirm("Hapus sesi ini?")) return;
  try {
    await api("deleteSesi", { id });
    document.getElementById("checkin").classList.add("hidden");
    showStatus("Sesi dihapus");
    await loadAll();
  } catch (err) { showStatus(err.message, true); }
}

// Absensi
function openCheckin(id) {
  const s = state.sesi.find(x => String(x.id) === String(id));
  const hadir = s.klienList ? s.klienList.split(",").filter(Boolean).map(String) : [];
  const el = document.getElementById("checkin");
  el.innerHTML = `<h3>Absensi: ${esc(s.kelas)} ${fmtDate(s.tanggal)} ${esc(s.waktu)}</h3>` +
    state.klien.map(k => {
      const checked = hadir.includes(String(k.id)) ? "checked" : "";
      return `<label><input type="checkbox" value="${k.id}" ${checked}> ${esc(k.nama)} (sisa ${k.sisaSesi})</label>`;
    }).join("") +
    `<button onclick="saveCheckin(${s.id})">Simpan Absensi</button>`;
  el.classList.remove("hidden");
}

async function saveCheckin(sesiId) {
  const ids = [...document.querySelectorAll("#checkin input:checked")].map(i => i.value);
  try {
    await api("checkin", { sesiId, klienIds: ids });
    showStatus("Absensi disimpan, sisa sesi diperbarui");
    await loadAll();
  } catch (err) { showStatus(err.message, true); }
}

// ---------- Paket ----------
function renderPaket() {
  const tbody = document.querySelector("#tbl-paket tbody");
  document.querySelector("#tbl-paket thead").innerHTML =
    "<tr><th>Nama</th><th>Harga</th><th>Jumlah Sesi</th><th></th></tr>";
  tbody.innerHTML = state.paket.map(p => `
    <tr>
      <td>${esc(p.nama)}</td><td>${rupiah(p.harga)}</td><td>${p.jumlahSesi}</td>
      <td>
        <button class="edit" onclick="editPaket(${p.id})">Edit</button>
        <button onclick="deletePaket(${p.id})">Hapus</button>
      </td>
    </tr>`).join("");
}

document.getElementById("form-paket").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("savePaket", {
      id: document.getElementById("paket-id").value,
      nama: document.getElementById("paket-nama").value,
      harga: document.getElementById("paket-harga").value,
      jumlahSesi: document.getElementById("paket-jumlahSesi").value,
    });
    hideForm("paket");
    showStatus("Paket disimpan");
    await loadAll();
  } catch (err) { showStatus(err.message, true); }
});

function editPaket(id) {
  const p = state.paket.find(x => String(x.id) === String(id));
  document.getElementById("paket-id").value = p.id;
  document.getElementById("paket-nama").value = p.nama;
  document.getElementById("paket-harga").value = p.harga;
  document.getElementById("paket-jumlahSesi").value = p.jumlahSesi;
  showForm("paket");
}

async function deletePaket(id) {
  if (!confirm("Hapus paket ini?")) return;
  try {
    await api("deletePaket", { id });
    showStatus("Paket dihapus");
    await loadAll();
  } catch (err) { showStatus(err.message, true); }
}

// ---------- Pembayaran ----------
function renderPembayaran() {
  const tbody = document.querySelector("#tbl-pembayaran tbody");
  document.querySelector("#tbl-pembayaran thead").innerHTML =
    "<tr><th>Tanggal</th><th>Klien</th><th>Jumlah</th><th>Sesi</th><th>Keterangan</th></tr>";
  tbody.innerHTML = state.pembayaran.map(p => {
    const k = state.klien.find(x => String(x.id) === String(p.klienId));
    return `<tr>
      <td>${fmtDate(p.tanggal)}</td><td>${k ? esc(k.nama) : "-"}</td>
      <td>${rupiah(p.jumlah)}</td><td>${p.sesi}</td><td>${esc(p.keterangan)}</td>
    </tr>`;
  }).join("");
}

document.getElementById("form-pembayaran").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("addPembayaran", {
      klienId: document.getElementById("pay-klienId").value,
      jumlah: document.getElementById("pay-jumlah").value,
      sesi: document.getElementById("pay-sesi").value,
      tanggal: document.getElementById("pay-tanggal").value,
      keterangan: document.getElementById("pay-keterangan").value,
    });
    hideForm("pembayaran");
    showStatus("Pembayaran dicatat, sisa sesi klien bertambah");
    await loadAll();
  } catch (err) { showStatus(err.message, true); }
});

function showForm(name) {
  if (name === "pembayaran") fillPaySelect();
  document.getElementById("form-" + name).classList.remove("hidden");
}

// ---------- Trend ----------
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const pad = (x) => x < 10 ? "0" + x : "" + x;
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
};

function renderTrend(days) {
  if (typeof Chart === "undefined") return;
  let data = state.trend;
  if (days !== "all") {
    const from = daysAgo(days);
    data = state.trend.filter(t => t.tanggal >= from);
  }
  if (trendChart) trendChart.destroy();
  const ctx = document.getElementById("trendChart");
  if (!data.length) {
    ctx.parentNode.innerHTML = "<p class='empty'>Belum ada data absensi.</p>";
    trendChart = null;
    return;
  }
  trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.map(t => t.tanggal.split("-").reverse().join("/")),
      datasets: [{
        label: "Pengunjung",
        data: data.map(t => t.jumlah),
        borderColor: "#2f6b5f",
        backgroundColor: "rgba(47,107,95,.12)",
        fill: true,
        tension: .35,
        pointRadius: 3,
        pointBackgroundColor: "#2f6b5f",
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "#f0ece6" } },
        x: { grid: { display: false } },
      },
    },
  });
}

document.getElementById("trendRange").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  document.querySelectorAll("#trendRange button").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  renderTrend(btn.dataset.days);
});

// ---------- Load all ----------
async function loadAll() {
  try {
    const [klien, sesi, paket, pembayaran, trend] = await Promise.all([
      api("listKlien"), api("listSesi"), api("listPaket"), api("listPembayaran"), api("getTrend"),
    ]);
    state.klien = klien; state.sesi = sesi; state.paket = paket; state.pembayaran = pembayaran;
    state.trend = trend;
    fillPaketSelect();
    renderKlien(); renderSesi(); renderPaket(); renderPembayaran();
    await renderDashboard();
    renderTrend("30");
  } catch (err) {
    showStatus(err.message, true);
  }
}

loadAll();
