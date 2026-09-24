# Kelasku — versi modular GitHub

Versi ini memisahkan HTML halaman dari CSS dan JavaScript supaya lebih mudah diedit.

## Struktur

```text
kelasku-github/
├── index.html
├── kelasku-env.js
├── manifest.json
├── css/
│   └── style.css
├── pages/
│   ├── beranda.html
│   ├── kas.html
│   ├── hp.html
│   ├── jadwal.html
│   ├── tugas.html
│   ├── laporan.html
│   ├── lainnya.html
│   ├── catur.html
│   └── settings.html
└── js/
    ├── boot.js
    ├── 00-security-bootstrap.js
    └── 01-*.js ... 14-*.js
```

## Bagian yang paling sering diedit

- `pages/beranda.html` → tampilan Beranda.
- `pages/kas.html` → tampilan Kas.
- `pages/jadwal.html` → tampilan Jadwal + Piket.
- `pages/tugas.html` → tampilan Tugas.
- `pages/laporan.html` → tampilan Laporan.
- `pages/hp.html` → tampilan HP.
- `pages/lainnya.html` → menu Lainnya.
- `pages/catur.html` → halaman Catur.
- `pages/settings.html` → Setelan.
- `css/style.css` → seluruh desain/warna/responsive.
- `js/` → logika aplikasi. File-file ini sengaja dipisah berdasarkan urutan script asli agar fungsi lama tetap bekerja.

## Upload ke GitHub

Upload **seluruh folder dan semua subfolder**, bukan hanya `index.html`.

Untuk GitHub Pages:
1. Upload semua file.
2. Buka Settings → Pages.
3. Pilih branch yang dipakai dan folder `/root`.
4. Simpan.

Catatan: versi ini memakai `fetch()` untuk mengambil `pages/*.html`, jadi jalankan melalui GitHub Pages atau server lokal, bukan dengan membuka `index.html` memakai double-click `file://`.
