// Kelasku modular boot loader
// Loads page HTML first, then the original application modules in order.
const PAGE_FILES = ["beranda.html", "kas.html", "hp.html", "jadwal.html", "tugas.html", "laporan.html", "lainnya.html", "catur.html", "settings.html"];
const SCRIPT_FILES = ["01-module-01.js", "02-kelasku-runtime-guards.js", "03-kelasku-modules-v6-js.js", "04-kelasku-kas-history-behavior.js", "05-kelasku-final-qa-js.js", "06-kelasku-local-chess-engine.js", "07-kelasku-chess-module.js", "08-kelasku-chess-zoom-guard-v6.js", "09-kelasku-global-no-zoom-js-v7.js", "10-kelasku-chess-fullscreen-only-v9.js", "11-kelasku-chess-fullscreen-exit-sync-v10.js", "12-kelasku-chess-fullscreen-escape-v11.js", "13-kelasku-pengumuman-edit-global-v12.js", "14-kelasku-chess-score-combined-js-v13.js"];

async function loadText(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Gagal memuat ${url} (${res.status})`);
  return res.text();
}

async function loadScript(src) {
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Gagal memuat ${src}`));
    document.body.appendChild(s);
  });
}

try {
  const screen = document.getElementById("app-screen");
  const htmlParts = await Promise.all(PAGE_FILES.map(file => loadText(`pages/${file}`)));
  screen.insertAdjacentHTML("beforeend", htmlParts.join("\n"));

  for (const file of SCRIPT_FILES) {
    await loadScript(`js/${file}`);
  }
} catch (error) {
  console.error(error);
  const screen = document.getElementById("app-screen");
  if (screen) {
    screen.innerHTML = `<div style="padding:24px;font-family:system-ui;color:#b91c1c">
      <h2>Kelasku gagal dimuat</h2>
      <p>${String(error.message || error)}</p>
      <p>Pastikan folder <b>pages</b>, <b>css</b>, dan <b>js</b> ikut di-upload ke GitHub.</p>
    </div>`;
  }
}
