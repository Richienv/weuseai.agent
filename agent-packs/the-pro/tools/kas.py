#!/usr/bin/env python3
"""kas.py — mesin hitung buku kas The Pro (weuseai.agent).

SEMUA angka keuangan customer dihitung di sini, bukan oleh LLM.
Skill buku-kas MEMANGGIL script ini via shell dan menyalin angkanya
apa adanya ke jawaban. Python stdlib saja — tidak ada dependency.

Data hidup di luar version tree bundle (default /var/lib/weuseai/data/kas)
supaya update pack tidak menghapus catatan customer.

Perintah:
  tambah   — append satu transaksi ke kas-YYYY-MM.csv (append-only)
  harian   — agregat satu hari: masuk, keluar, selisih, per kategori
  bulanan  — agregat satu bulan: masuk, keluar, selisih, per kategori, per hari
  pph      — omzet bruto sebulan + PPh final UMKM 0,5% (PP 55/2022)
  hpp      — recompute HPP per porsi dari file resep markdown (resep/*.md)

Semua output JSON ke stdout. Exit 0 sukses, exit 1 error (pesan di stderr).
"""

import argparse
import csv
import json
import os
import re
import sys
from datetime import date, datetime

DEFAULT_DIR = "/var/lib/weuseai/data/kas"
CSV_HEADER = ["tanggal", "jenis", "kategori", "deskripsi", "jumlah"]
JENIS_VALID = ("masuk", "keluar")
# PPh final UMKM 0,5% dari omzet bruto (PP 55/2022, lanjutan PP 23/2018).
PPH_FINAL_RATE = 0.005


def die(msg: str) -> None:
    print(f"kas.py: {msg}", file=sys.stderr)
    sys.exit(1)


def parse_tanggal(s: str) -> date:
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        die(f"tanggal tidak valid: {s!r} (format YYYY-MM-DD)")
        raise  # unreachable


def parse_bulan(s: str) -> str:
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", s):
        die(f"bulan tidak valid: {s!r} (format YYYY-MM)")
    return s


def parse_jumlah(s: str) -> int:
    """Jumlah rupiah sebagai integer. Terima '15000', '15.000', 'Rp 15.000'."""
    cleaned = re.sub(r"(?i)^rp\.?\s*", "", s.strip()).replace(".", "").replace(",", "")
    if not re.fullmatch(r"\d+", cleaned):
        die(f"jumlah tidak valid: {s!r} (contoh benar: 15000 atau 15.000)")
    value = int(cleaned)
    if value <= 0:
        die("jumlah harus lebih dari nol")
    return value


def csv_path(data_dir: str, bulan: str) -> str:
    return os.path.join(data_dir, f"kas-{bulan}.csv")


def read_rows(data_dir: str, bulan: str) -> list:
    """Baca transaksi satu bulan. File belum ada = list kosong (bukan error)."""
    path = csv_path(data_dir, bulan)
    if not os.path.exists(path):
        return []
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader, start=2):
            try:
                rows.append(
                    {
                        "tanggal": row["tanggal"],
                        "jenis": row["jenis"],
                        "kategori": row["kategori"],
                        "deskripsi": row["deskripsi"],
                        "jumlah": int(row["jumlah"]),
                    }
                )
            except (KeyError, TypeError, ValueError):
                die(f"{path} baris {i} rusak — perbaiki manual sebelum lanjut")
    return rows


def cmd_tambah(args) -> dict:
    tgl = parse_tanggal(args.tanggal)
    if args.jenis not in JENIS_VALID:
        die(f"jenis harus 'masuk' atau 'keluar', bukan {args.jenis!r}")
    jumlah = parse_jumlah(args.jumlah)
    kategori = args.kategori.strip() or "lainnya"
    deskripsi = args.deskripsi.strip()
    if not deskripsi:
        die("deskripsi tidak boleh kosong")

    os.makedirs(args.dir, exist_ok=True)
    bulan = tgl.strftime("%Y-%m")
    path = csv_path(args.dir, bulan)
    is_new = not os.path.exists(path)
    with open(path, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if is_new:
            writer.writerow(CSV_HEADER)
        writer.writerow([tgl.isoformat(), args.jenis, kategori, deskripsi, jumlah])

    return {
        "ok": True,
        "aksi": "tambah",
        "file": path,
        "transaksi": {
            "tanggal": tgl.isoformat(),
            "jenis": args.jenis,
            "kategori": kategori,
            "deskripsi": deskripsi,
            "jumlah": jumlah,
        },
    }


def agregat(rows: list) -> dict:
    masuk = sum(r["jumlah"] for r in rows if r["jenis"] == "masuk")
    keluar = sum(r["jumlah"] for r in rows if r["jenis"] == "keluar")
    per_kategori = {}
    for r in rows:
        bucket = per_kategori.setdefault(r["kategori"], {"masuk": 0, "keluar": 0})
        bucket[r["jenis"]] += r["jumlah"]
    return {
        "jumlah_transaksi": len(rows),
        "total_masuk": masuk,
        "total_keluar": keluar,
        "selisih": masuk - keluar,
        "per_kategori": dict(sorted(per_kategori.items())),
    }


def cmd_harian(args) -> dict:
    tgl = parse_tanggal(args.tanggal)
    bulan = tgl.strftime("%Y-%m")
    rows = [r for r in read_rows(args.dir, bulan) if r["tanggal"] == tgl.isoformat()]
    out = {"ok": True, "aksi": "harian", "tanggal": tgl.isoformat()}
    out.update(agregat(rows))
    out["transaksi"] = rows
    return out


def cmd_bulanan(args) -> dict:
    bulan = parse_bulan(args.bulan)
    rows = read_rows(args.dir, bulan)
    per_hari = {}
    for r in rows:
        bucket = per_hari.setdefault(r["tanggal"], {"masuk": 0, "keluar": 0})
        bucket[r["jenis"]] += r["jumlah"]
    out = {"ok": True, "aksi": "bulanan", "bulan": bulan}
    out.update(agregat(rows))
    out["per_hari"] = dict(sorted(per_hari.items()))
    return out


def cmd_pph(args) -> dict:
    bulan = parse_bulan(args.bulan)
    rows = read_rows(args.dir, bulan)
    omzet = sum(r["jumlah"] for r in rows if r["jenis"] == "masuk")
    pph = round(omzet * PPH_FINAL_RATE)
    return {
        "ok": True,
        "aksi": "pph",
        "bulan": bulan,
        "dasar": "PPh final UMKM 0,5% dari omzet bruto (PP 55/2022)",
        "omzet_bruto": omzet,
        "tarif": PPH_FINAL_RATE,
        "pph_terutang": pph,
        "catatan": (
            "Perhitungan indikatif dari catatan kas, bukan nasihat pajak. "
            "Setor lewat kanal resmi DJP dan cek kesesuaian skema dengan AR pajak kamu."
        ),
    }


RESEP_BAHAN_RE = re.compile(r"^-\s*(?P<nama>[^|]+)\|(?P<qty>[^|]+)\|\s*(?P<harga>[\d.,]+)\s*$")
RESEP_PORSI_RE = re.compile(r"(?im)^porsi\s*:\s*(\d+)\s*$")


def parse_resep(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        text = f.read()
    m_porsi = RESEP_PORSI_RE.search(text)
    if not m_porsi:
        die(f"{path}: baris 'porsi: N' tidak ditemukan")
    porsi = int(m_porsi.group(1))
    if porsi <= 0:
        die(f"{path}: porsi harus lebih dari nol")

    bahan = []
    for line in text.splitlines():
        m = RESEP_BAHAN_RE.match(line.strip())
        if not m:
            continue
        harga_raw = m.group("harga").replace(".", "").replace(",", "")
        if not harga_raw.isdigit():
            die(f"{path}: harga bahan tidak valid di baris {line.strip()!r}")
        bahan.append(
            {
                "nama": m.group("nama").strip(),
                "qty": m.group("qty").strip(),
                "harga": int(harga_raw),
            }
        )
    if not bahan:
        die(f"{path}: tidak ada baris bahan '- nama | qty | harga'")

    total = sum(b["harga"] for b in bahan)
    nama_match = re.search(r"(?m)^#\s*(?:Resep:\s*)?(.+)$", text)
    return {
        "file": path,
        "nama": (nama_match.group(1).strip() if nama_match else os.path.basename(path)),
        "porsi": porsi,
        "bahan": bahan,
        "total_biaya_bahan": total,
        "hpp_per_porsi": round(total / porsi),
    }


def cmd_hpp(args) -> dict:
    resep_dir = os.path.join(args.dir, "resep")
    if args.resep:
        paths = [args.resep if os.path.isabs(args.resep) else os.path.join(resep_dir, args.resep)]
        if not os.path.exists(paths[0]):
            die(f"resep tidak ditemukan: {paths[0]}")
    else:
        if not os.path.isdir(resep_dir):
            die(f"folder resep belum ada: {resep_dir}")
        paths = sorted(
            os.path.join(resep_dir, f)
            for f in os.listdir(resep_dir)
            if f.endswith(".md") and not f.startswith("_") and not f.startswith("._")
        )
        if not paths:
            die(f"tidak ada file resep .md di {resep_dir}")
    return {"ok": True, "aksi": "hpp", "resep": [parse_resep(p) for p in paths]}


def main() -> None:
    parser = argparse.ArgumentParser(description="Mesin hitung buku kas (deterministik).")
    parser.add_argument("--dir", default=DEFAULT_DIR, help="folder data kas")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("tambah", help="append satu transaksi")
    p.add_argument("--tanggal", required=True)
    p.add_argument("--jenis", required=True, choices=JENIS_VALID)
    p.add_argument("--kategori", default="lainnya")
    p.add_argument("--deskripsi", required=True)
    p.add_argument("--jumlah", required=True)
    p.set_defaults(fn=cmd_tambah)

    p = sub.add_parser("harian", help="agregat satu hari")
    p.add_argument("--tanggal", required=True)
    p.set_defaults(fn=cmd_harian)

    p = sub.add_parser("bulanan", help="agregat satu bulan")
    p.add_argument("--bulan", required=True)
    p.set_defaults(fn=cmd_bulanan)

    p = sub.add_parser("pph", help="omzet + PPh final 0,5% sebulan")
    p.add_argument("--bulan", required=True)
    p.set_defaults(fn=cmd_pph)

    p = sub.add_parser("hpp", help="recompute HPP dari resep/*.md")
    p.add_argument("--resep", help="satu file resep; kosongkan untuk semua")
    p.set_defaults(fn=cmd_hpp)

    args = parser.parse_args()
    print(json.dumps(args.fn(args), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
