# Dataset bank sintetis untuk empat skenario

Sumber batas profil: MAIN-READABILITY TEST (1).pdf. Tanggal, merchant generik, rincian transaksi, total bulanan terpilih, pembayaran historis, dan saldo awal adalah asumsi implementasi baru; bukan fakta tambahan dari instrumen.

## Waktu tetap
- Spending H0: 20 Oktober 2026; gajian berikutnya 1 November (12 hari). Riwayat penuh Juli–September; bulan berjalan 1–20 Oktober. Gaji historis setiap tanggal 1, termasuk 1 Oktober.
- Saving H0: 1 November 2026 setelah gaji masuk; berikutnya 1 Desember (30 hari). Riwayat penuh Agustus–Oktober. Belum ada pengeluaran November.

## Kebijakan sumber dan pemakaian
Profil mengikat; riwayat mendukungnya. Alokasi adalah label virtual di rekening yang sama. Mengubah label alokasi tidak mengurangi saldo bank. Transfer eksternal membutuhkan model rekening tujuan terpisah.
Jangan menampilkan saldo awal historis sebagai saldo dana darurat historis: komposisi alokasi baru ditetapkan pada H0.
Tagihan belum dibayar dipisahkan dari transaksi. Estimasi utilitas tidak punya tanggal jatuh tempo pasti. Gunakan rentang, bukan mengubah estimasi menjadi fakta.
Spending: kebutuhan rutin tiga bulan 3,8/4,2/4,6 juta; bulan berjalan 2,4 juta. Tagihan khusus historis 1,8 juta/bulan adalah asumsi sintetis.
Saving: kebutuhan rutin tiga bulan 2,4/2,7/3 juta; tagihan historis sewa 2,4 juta, kartu 0,6 juta, utilitas 0,5 juta/bulan adalah asumsi sintetis.
Rata-rata historis tidak menjamin pengeluaran masa depan. Saving biaya rutin dan kewajiban mendatang total 5,8–6,6 juta; sisa pendapatan sebelum setoran 1,4–2,2 juta. Setoran 2 juta menghasilkan sisa -0,6 sampai +0,2 juta di KEDUA kondisi. High memiliki tujuan sertifikasi tambahan; jangan memaksakan defisit hanya di High.
Spending alokasi laptop Low masih kurang 1 juta terhadap harga 7 juta. High tidak otomatis mengambil dana sertifikasi; sumber penutupan kekurangan perlu disimulasikan eksplisit.
Skenario saving dimulai tanpa nominal setoran aktif; opsi 1/2/3 juta bukan keputusan pengguna. Laptop cicilan: bunga flat dan admin tersedia; jadwal tagihan pertama/admin belum diketahui. Jangan mengarang tanggalnya.

## Integrasi
scenarios.json berisi profil, alokasi, kewajiban, dan transaksi; CSV adalah ekspor mutasi. Basic jangan menerima profil, transaksi, ringkasan turunannya atau jawaban contoh yang membocorkan profil. Context-aware menerima data sesuai kondisi sesi. UI kedua kondisi dapat memakai snapshot yang sama untuk skenario yang sama.
Tampilan saldo harus membaca current_balance; total alokasi dari allocations; grafik bulanan dihitung dari transactions kategori routine. Jangan mengurangi lagi pengeluaran historis dari saldo terkini.

## Verifikasi
Jalankan python3 generate.py. Script memeriksa saldo setiap transaksi tidak negatif, saldo penutup sesuai profil, total alokasi sama dengan saldo, dan total rutin bulanan sesuai target. validation.json menyimpan rekonsiliasi. Pemeriksaan ini memvalidasi dataset, bukan keseluruhan chatbot atau validitas metodologi.
