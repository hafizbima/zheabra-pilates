// ============================================================
//  PILATES MANAGER - Vercel Serverless Function
//  Endpoint: POST /api  body: { action, ...data }
//  Butuh env: SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL,
//             GOOGLE_PRIVATE_KEY (lihat .env.example)
// ============================================================
const { google } = require("googleapis");

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const SS = process.env.SPREADSHEET_ID;

const TABS = {
  Klien: ["id", "nama", "noHP", "email", "paketId", "sisaSesi", "joinDate"],
  Sesi: ["id", "tanggal", "waktu", "kelas", "instruktur", "kuota", "klienList"],
  Paket: ["id", "nama", "harga", "jumlahSesi"],
  Pembayaran: ["id", "klienId", "jumlah", "sesi", "tanggal", "keterangan"],
};

const pad = (n) => (n < 10 ? "0" + n : "" + n);
const todayStr = () => {
  const d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
};

async function ensureTabs() {
  const res = await sheets.spreadsheets.get({ spreadsheetId: SS });
  const existing = new Set(res.data.sheets.map((s) => s.properties.title));
  for (const name of Object.keys(TABS)) {
    if (!existing.has(name)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SS,
        requestBody: { requests: [{ addSheet: { properties: { title: name } } }] },
      });
    }
  }
}

async function readAll(name) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SS,
    range: `${name}!A1:Z1000`,
  });
  const rows = res.data.values || [];
  if (!rows.length) return [];
  const head = rows[0];
  return rows.slice(1).map((r) => {
    const o = {};
    head.forEach((h, i) => (o[h] = r[i] == null ? "" : r[i]));
    return o;
  });
}

async function writeAll(name, rows) {
  const head = TABS[name];
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SS,
    range: `${name}!A1:Z1000`,
  });
  const values = [head, ...rows.map((r) => head.map((h) => (r[h] == null ? "" : r[h])))];
  if (values.length > 1) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SS,
      range: `${name}!A1`,
      valueInputOption: "RAW",
      requestBody: { values },
    });
  }
}

function nextId(rows) {
  let max = 0;
  rows.forEach((r) => {
    const n = parseInt(r.id, 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return max + 1;
}

function findByKey(rows, id) {
  return rows.find((r) => String(r.id) === String(id));
}

// ---------- actions ----------

async function listKlien() { return readAll("Klien"); }
async function listSesi() { return readAll("Sesi"); }
async function listPaket() { return readAll("Paket"); }
async function listPembayaran() { return readAll("Pembayaran"); }

async function getTrend() {
  const sesi = await readAll("Sesi");
  const map = {};
  sesi.forEach((s) => {
    const n = s.klienList ? String(s.klienList).split(",").filter(Boolean).length : 0;
    const t = String(s.tanggal || "");
    if (!t) return;
    map[t] = (map[t] || 0) + n;
  });
  return Object.keys(map).sort().map((k) => ({ tanggal: k, jumlah: map[k] }));
}

async function getDashboard() {
  const [klien, sesi, bayar] = await Promise.all([
    readAll("Klien"), readAll("Sesi"), readAll("Pembayaran"),
  ]);
  const today = todayStr();
  const month = today.substring(0, 7);
  let sum = 0;
  bayar.forEach((p) => {
    const t = String(p.tanggal || "");
    if (t.indexOf(month) === 0) sum += parseInt(p.jumlah, 10) || 0;
  });
  const sesiToday = sesi.filter((s) => String(s.tanggal) === today);
  return {
    totalKlien: klien.length,
    klienAktif: klien.filter((k) => (parseInt(k.sisaSesi, 10) || 0) > 0).length,
    sesiHariIni: sesiToday.length,
    pemasukanBulanIni: sum,
    sesiHariIniList: sesiToday,
  };
}

async function saveKlien(b) {
  const rows = await readAll("Klien");
  const obj = {
    id: b.id || String(nextId(rows)),
    nama: b.nama,
    noHP: b.noHP,
    email: b.email || "",
    paketId: b.paketId || "",
    sisaSesi: parseInt(b.sisaSesi, 10) || 0,
    joinDate: b.joinDate || todayStr(),
  };
  const i = rows.findIndex((r) => String(r.id) === String(obj.id));
  if (i === -1) rows.push(obj); else rows[i] = obj;
  await writeAll("Klien", rows);
  return obj;
}

async function deleteKlien(b) {
  const rows = await readAll("Klien");
  const filtered = rows.filter((r) => String(r.id) !== String(b.id));
  await writeAll("Klien", filtered);
  return { ok: filtered.length !== rows.length };
}

async function savePaket(b) {
  const rows = await readAll("Paket");
  const obj = {
    id: b.id || String(nextId(rows)),
    nama: b.nama,
    harga: parseInt(b.harga, 10) || 0,
    jumlahSesi: parseInt(b.jumlahSesi, 10) || 0,
  };
  const i = rows.findIndex((r) => String(r.id) === String(obj.id));
  if (i === -1) rows.push(obj); else rows[i] = obj;
  await writeAll("Paket", rows);
  return obj;
}

async function deletePaket(b) {
  const rows = await readAll("Paket");
  const filtered = rows.filter((r) => String(r.id) !== String(b.id));
  await writeAll("Paket", filtered);
  return { ok: filtered.length !== rows.length };
}

async function saveSesi(b) {
  const rows = await readAll("Sesi");
  const obj = {
    id: b.id || String(nextId(rows)),
    tanggal: b.tanggal,
    waktu: b.waktu || "",
    kelas: b.kelas || "",
    instruktur: b.instruktur || "",
    kuota: parseInt(b.kuota, 10) || 0,
    klienList: b.klienList || "",
  };
  const i = rows.findIndex((r) => String(r.id) === String(obj.id));
  if (i === -1) rows.push(obj); else rows[i] = obj;
  await writeAll("Sesi", rows);
  return obj;
}

async function deleteSesi(b) {
  const rows = await readAll("Sesi");
  const filtered = rows.filter((r) => String(r.id) !== String(b.id));
  await writeAll("Sesi", filtered);
  return { ok: filtered.length !== rows.length };
}

// Absensi: set daftar hadir sesi, kurangi sisaSesi klien yang BARU hadir
async function checkin(b) {
  const sesiRows = await readAll("Sesi");
  const s = findByKey(sesiRows, b.sesiId);
  if (!s) return { error: "Sesi tidak ditemukan" };
  const oldList = s.klienList ? String(s.klienList).split(",").filter(Boolean) : [];
  const newList = (b.klienIds || []).map(String);
  let count = 0;
  const added = newList.filter((id) => oldList.indexOf(id) === -1);
  if (added.length) {
    const klienRows = await readAll("Klien");
    added.forEach((id) => {
      const k = findByKey(klienRows, id);
      if (k) {
        k.sisaSesi = Math.max(0, (parseInt(k.sisaSesi, 10) || 0) - 1);
        count++;
      }
    });
    await writeAll("Klien", klienRows);
  }
  s.klienList = newList.join(",");
  await writeAll("Sesi", sesiRows);
  return { ok: true, decremented: count, klienList: s.klienList };
}

async function addPembayaran(b) {
  const payRows = await readAll("Pembayaran");
  const pay = {
    id: String(nextId(payRows)),
    klienId: b.klienId,
    jumlah: parseInt(b.jumlah, 10) || 0,
    sesi: parseInt(b.sesi, 10) || 0,
    tanggal: b.tanggal || todayStr(),
    keterangan: b.keterangan || "",
  };
  payRows.push(pay);
  await writeAll("Pembayaran", payRows);
  const klienRows = await readAll("Klien");
  const k = findByKey(klienRows, b.klienId);
  if (k) {
    k.sisaSesi = (parseInt(k.sisaSesi, 10) || 0) + pay.sesi;
    await writeAll("Klien", klienRows);
  }
  return { ok: true, pembayaran: pay };
}

const handlers = {
  listKlien, listSesi, listPaket, listPembayaran,
  getTrend, getDashboard,
  saveKlien, deleteKlien, savePaket, deletePaket,
  saveSesi, deleteSesi, checkin, addPembayaran,
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    await ensureTabs();
    const { action, ...data } = req.body || {};
    const fn = handlers[action];
    if (!fn) return res.status(400).json({ error: "Unknown action: " + action });
    const result = await fn(data);
    if (result && result.error) return res.status(400).json(result);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
