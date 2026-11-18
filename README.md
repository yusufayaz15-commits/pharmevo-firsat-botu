# Pharmevo Fırsat Botu

Pharmevo Fikir Havuzu sitesindeki **📡 Canlı Çağrı & Yarışma Radarı** için arka plan taraması.

- 6 saatte bir (GitHub Actions) Türkiye'deki proje, hibe, yarışma, kuluçka ve kongre duyurularını açık RSS akışlarından tarar,
  anahtar kelime süzgecinden geçirir ve `assets/firsatlar.json` dosyasına yazar.
- Site listeyi şu adresten okur: `https://raw.githubusercontent.com/yusufayaz15-commits/pharmevo-firsat-botu/main/assets/firsatlar.json`
- Dosya 3 günden eskiyse ya da okunamazsa site kendi canlı taramasına ve gömülü seçkiye düşer; radar hiçbir koşulda boş açılmaz.

Bu depoda yalnızca bot betiği, zamanlayıcı ve botun ürettiği liste vardır. Site kodu, şifre ya da kişisel bilgi yoktur.

**Elle çalıştırma:** Actions → "Fırsat botu" → Run workflow.
**Yerelde deneme:** `node araclar/firsat-botu.mjs --kuru` (Node 18+, ek paket gerekmez).
