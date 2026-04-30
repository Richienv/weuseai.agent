# Day 1 — IDCloudHost API validation test

**Tujuan:** validate critical assumption sebelum bangun apa pun yang lain. **Bisa nggak IDCloudHost API auto-provision VPS dalam ≤180 detik?**

Kalau pass: lanjut bangun provisioning service.
Kalau fail: pivot ke Vultr Jakarta atau plan B.

## Run

```bash
npm install
cp .env.example .env
# isi IDCLOUDHOST_API_KEY dan IDCLOUDHOST_BILLING_ACCOUNT_ID dari dashboard
npm run test
```

## Apa yang script ini lakukan

1. Create VPS Ubuntu 24.04, 1 vCPU, 4 GB RAM, 50 GB disk
2. Inject cloud-init yang install Docker + tulis health marker file
3. Poll status setiap 3 detik sampai `running`
4. Catat waktu total
5. Verify cloud-init selesai (cek kalau marker file ada)
6. Delete VPS (cleanup, jangan ada biaya tertinggal)

## Output yang diharapkan

```
[+0s] Creating VM...
[+2s] Created. UUID: fc880f74-...
[+2s] Polling for running status...
[+5s] status=installing
[+45s] status=installing
[+78s] status=running
[+78s] ✓ Running. Total time: 78s
[+78s]   Public IP: 103.xxx.xxx.xxx
[+90s] Cleaning up — deleting VM...
[+92s] ✓ Deleted

=== TEST RESULT ===
Total time end-to-end: 92s
Verdict: PASS — feasible for 5-min onboarding
```

## Kalau gagal

Output akan kasih clue. Common failures:

- **Auth error:** API key salah atau billing account ID salah. Cek di dashboard.idcloudhost.com → API Keys
- **Timeout (>5 min):** API atau provisioning lambat. Catat waktu, kontak support, atau pivot
- **400 invalid params:** mungkin nama OS/version mismatch — coba `ubuntu` 22.04 dulu

## Ada juga cleanup script

Kalau test crash di tengah dan VM kebuang nggak terhapus:

```bash
npm run test:cleanup
```

Bakal list semua VM yang nama-nya prefix `liren-test-` dan delete satu-satu.
