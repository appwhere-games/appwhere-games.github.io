# Appwhere

Yeni çıkan mobil oyunları tarihe göre keşfet. App Store ve Google Play, oyun türleri, ülke filtreleri ve üçlü mağaza galerileri.

**Canlı site:** https://appwhere-games.github.io/

## Canlı yayın ve güncelleme

GitHub Pages statik arayüzü yayınlar. `Update games` iş akışı her saat, saatin 17. dakikasında oyunları tarar, yeni verileri depoya kaydeder ve siteyi yeniden yayınlar. GitHub yoğunluğuna göre başlangıç gecikebilir.

Canlıdaki **Güncelle** butonu GitHub tarama sayfasını açar. Depoya yazma yetkisi olan kullanıcı **Run workflow** ile elle tarama başlatabilir. Site devam eden taramayı izler ve yayın tamamlanınca listeyi yeniler. Tarayıcıya hiçbir GitHub anahtarı veya erişim belirteci verilmez.

`.github/workflows/deploy.yml`: kod değişikliklerini test eder ve yayınlar.

`.github/workflows/collect.yml`: saatlik ve elle başlatılan mağaza taraması, veri kaydı ve yayın.

## Yerel çalıştırma

Node.js 24 ve pnpm 11 kullanın:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run preview
```

Site http://127.0.0.1:4173 adresinde açılır. Windows'ta `Appwhere-Baslat.cmd` da kullanılabilir. Yereldeki Güncelle butonu taramayı doğrudan yerel Node.js sunucusunda çalıştırır; komut satırından `pnpm run collect` veya `Appwhere-Guncelle.cmd` da kullanılabilir.

## Özellikler

- Türkiye saatine göre gün değişimini takip eden sabit TODAY görünümü.
- Günlük arşiv, tarih aralığı, mağaza, oyun türü, ülke ve ücret filtreleri.
- Mağazadan alınan üç görsel, büyütme ve klavye ile gezinme.
- Mobil ve masaüstüne uyarlanan, yüksek kontrastlı arayüz.
- Eşzamanlı taramaları engelleyen işlem kilidi ve hata durumunda son kataloğu koruma.

## Veri kapsamı

Bu bir eksiksiz mağaza indeksi değildir. App Store için 175 ülke/bölgenin yeni oyun RSS akışı denenir. Google Play hız sınırları için her taramada sıradaki 8 ülke/bölge aranır; en fazla 160 adayın detayı incelenir. Sıra ve bekleyen adaylar sonraki taramaya aktarılır. Google Play'in taradığı ülkeler zamanla genişler.

Yalnızca oyunlar ve doğrulanmış ilk yayın tarihleri kullanılır; güncelleme ya da keşif tarihleri çıkış tarihi yerine geçmez. Ülke, oyunun gözlendiği mağazadır; dünya çapındaki ilk yayını veya güncel erişilebilirliği garanti etmez. Aynı oyunun iOS ve Android sürümleri ayrı kayıtlardır. Arşiv zamanla birikir; mağazadan kaldırılan oyunlar arşivde kalabilir.

Görseller Apple Lookup, uygulamanın ürün sayfası ve Google Play detaylarından alınır. Üçten az görsel varsa eksik alanlar belirtilir. Görseller ve türler 7 gün önbelleklenir. Mağaza görsellerinin hakları ilgili geliştiricilere aittir.

Kaynaklar: [Apple mağaza bölgeleri](https://support.apple.com/en-us/118205), [Google bölge dizini](https://play.google.com/supported-locations?hl=en), [iTunes Search API](https://performance-partners.apple.com/search-api), [Google Play scraper](https://github.com/facundoolano/google-play-scraper).

## Kontroller ve statik paket

```sh
pnpm test
pnpm run build:pages
```

Yayın paketi `work/pages` içinde oluşur. Yalnızca arayüz, genel medya dosyaları ve `data/apps.json` yayınlanır. Yerel sunucu, testler ve tarama önbellekleri statik pakete dahil edilmez.

`assets/hosting.js` yerelde `local`, yayın paketinde `github-pages` modundadır. GitHub Pages'te sunucu komutu çalıştırılamadığı için tarama GitHub Actions tarafından gerçekleştirilir.
