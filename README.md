# ApplyFlow

Kullanıcı hesabına özel iş başvurusu ve mülakat takip uygulaması. React, TypeScript, Vite ve Tailwind CSS arayüzü; Node.js HTTP API kullanır. Yerelde SQLite, Render üzerinde PostgreSQL ile çalışır.

## Geliştirme

Node.js **24 veya üzeri** ve pnpm 10 gereklidir. Ek veritabanı servisi veya bulut hesabı gerekmez.

```sh
pnpm install
pnpm dev
```

Bu komut API'yi `http://127.0.0.1:3001`, arayüzü `http://127.0.0.1:5173` adresinde başlatır. Arayüzde **Hesap oluştur** ile kendi hesabınızı açın. Varsayılan parola veya yönetici hesabı yoktur; yeni hesaplar boş başlar. Vite `/api` isteklerini yerel sunucuya iletir.

İki terminalde ayrı başlatmak için `pnpm dev:server` ve `pnpm dev:client` kullanabilirsiniz. Yapılandırma isteğe bağlıdır: `.env.example` dosyasını `.env` olarak kopyalayın.

```sh
pnpm test
pnpm build
pnpm start
```

`pnpm start`, derlenmiş arayüzü ve API'yi birlikte `http://127.0.0.1:3001` adresinde sunar. `pnpm preview` yalnızca statik arayüz içindir; hesap ve veritabanı testinde `pnpm start` kullanın.

## Özellikler

- Kayıt olma, giriş yapma, oturumu koruma ve çıkış
- Mevcut parolayla parola değiştirme; diğer oturumların iptali
- Her hesaba ait başvuruların sunucuda saklanması
- Başvuru ekleme, listeleme, düzenleme ve onayla silme
- Sürükle-bırak pano, liste görünümü, arama ve filtreler
- Mülakat takvimi, yaklaşan görüşme ve istatistikler
- İstatistiklerde etkileşimli Sankey diyagramı: mevcut aşamalara göre gerçek kayıt sayıları, orantılı akış kalınlığı, yüzde ve aşama vurgulama. Geçiş geçmişi veya mülakat turu varsayılmaz.
- JSON yedekleme ve kimlik bazında birleştirerek içe aktarma
- Eski LocalStorage kayıtlarını açık seçimle giriş yapılan hesaba aktarma
- Mobil uyumlu Türkçe arayüz ve klavye ile kullanılabilen formlar

## Eski kayıtları taşıma

Önceki tarayıcı kayıtları silinmez veya otomatik olarak bir hesaba atanmaz. Giriş yaptıktan sonra **Çalışma alanı ayarları → Eski tarayıcı kayıtların bulundu** bölümünde hesabın e-posta adresini kontrol edin. Onay kutusunu işaretleyip aktarın. Aynı kimlikte hesap kaydı varsa hesap sürümü korunur. Örnekler de aktarılır; ardından yalnızca örnekleri kaldırabilirsiniz. JSON içe aktarmada ise aynı kimlikteki kayıt yedekteki sürümle güncellenir.

## Veritabanı ve yalıtım

`DATABASE_URL` verilmezse yerelde `data/applyflow.sqlite` ilk çalıştırmada oluşur. SQLite şeması `server/schema.sql`, PostgreSQL şeması `server/schema.postgres.sql` dosyasındadır. `DATABASE_URL` tanımlıysa PostgreSQL kullanılır; bağlantı başarısızsa SQLite'a geçilmez. Üretimde `DATABASE_URL` zorunludur. Tablolar sunucu başlatılırken otomatik oluşturulur; ayrı migration komutu gerekmez.

| Tablo          | İçerik                                                  |
| -------------- | ------------------------------------------------------- |
| `users`        | Kimlik, ad, e-posta, parola özeti, kayıt sürümü         |
| `sessions`     | Oturum anahtarı özeti, kullanıcı ve son kullanma zamanı |
| `applications` | Kullanıcı kimliğiyle ilişkilendirilmiş başvurular       |

Parolalar rastgele tuzla `scrypt` kullanılarak özetlenir. Rastgele oturum kimliği `HttpOnly`, `SameSite=Lax` çerezindedir; üretimde `Secure` eklenir. Oturum anahtarının yalnızca SHA-256 özeti veritabanına yazılır. Oturum süresi 7 gündür. Giriş/kayıt/parola istekleri IP başına 15 dakikada 20 denemeyle sınırlandırılır.

Sunucu kullanıcıyı çerezden belirler; istemcinin gönderdiği kullanıcı kimliğine güvenmez. Her okuma/yazma oturum kullanıcısıyla sınırlandırılır; `(user_id,id)` birleşik anahtarı aynı kayıt kimliğinin farklı hesaplarda bağımsız kullanılmasını sağlar. SQL sorguları parametrelidir. Yazmalar izin verilen Origin ve özel istek başlığı gerektirir; CORS erişimi açılmaz.

Başvuru koleksiyonu tek transaction içinde güncellenir. Kayıt sürümü uyuşmuyorsa sunucu `409` döndürür; eski sekme yeni veriyi ezemez. İstemci yalnızca başarılı sunucu yanıtından sonra kayıtları değiştirir ve başarı mesajı gösterir. Form hatada açık kalır. En fazla 1000 başvuru ve 5 MB istek desteklenir.

## API

| Metot | Yol                  | Amaç                                  |
| ----- | -------------------- | ------------------------------------- |
| POST  | `/api/auth/register` | Hesap oluşturma                       |
| POST  | `/api/auth/login`    | Giriş                                 |
| GET   | `/api/auth/me`       | Geçerli oturum                        |
| POST  | `/api/auth/logout`   | Oturum iptali                         |
| POST  | `/api/auth/password` | Parola değiştirme                     |
| GET   | `/api/applications`  | Hesabın başvuruları ve sürümü         |
| PUT   | `/api/applications`  | Sürüm kontrollü koleksiyon güncelleme |
| GET   | `/api/health`        | Sunucu sağlığı                        |

## Yedek

Kullanıcı başvurularını JSON olarak indirebilir. Tüm kullanıcıları içeren veritabanı yedeği için sunucuyu durdurun ve `data/` klasörünü güvenli bir konuma kopyalayın. SQLite WAL kullandığından çalışan sunucunun yalnızca `.sqlite` dosyasını kopyalamayın. Geri yüklerken sunucu kapalı olmalıdır. Veritabanı disk üzerinde şifrelenmez; makine ve yedek erişimlerini koruyun. `.env`, `data/`, veritabanı dosyaları ve kişisel JSON yedekleri GitHub'a eklenmemelidir.

## Yayınlama

Bu sürüm yalnızca statik dosya yüklemesiyle çalışmaz. **Node.js 24+ ve PostgreSQL** gerekir. `pnpm build` ardından `pnpm start` ile arayüz ve API aynı kaynaktan sunulur.

### Render üzerinde ücretsiz demo

1. [Render](https://dashboard.render.com/) hesabını GitHub'a bağlayın.
2. **New → Blueprint** seçip bu depoyu ve `main` dalını seçin. Dosya yolu `render.yaml` olarak kalsın.
3. Listelenen `applyflow` Web Service ve `applyflow-db` PostgreSQL için planların **Free** olduğunu doğrulayıp oluşturun. Mevcut bir ücretsiz PostgreSQL varsa Render'ın tek ücretsiz veritabanı sınırını dikkate alın.
4. Blueprint veritabanı bağlantısını `DATABASE_URL` olarak otomatik aktarır. İki kaynak Frankfurt bölgesindedir; veritabanı yalnızca Render'ın özel ağına açıktır. Şifreyi dosyaya veya GitHub'a eklemeyin.
5. Uygulama **Live** olduğunda Web Service sayfasındaki HTTPS bağlantısını açın. Render'ın `RENDER_EXTERNAL_URL` değeri izin verilen istek kaynağı olarak otomatik kullanılır. Kendi alan adınız varsa `APP_ORIGINS` ile izin verilen HTTPS adreslerini ayrıca tanımlayın.
6. Hesap oluşturun, başvuru kaydedin, sayfayı yenileyin ve çıkıp tekrar giriş yapın. Servisi yeniden başlatıp kayıtların durduğunu kontrol edin. `/api/health` veritabanı bağlantısını da denetler.

Ücretsiz Web Service 15 dakika trafik almazsa uyur; tekrar açılması yaklaşık bir dakika sürebilir. PostgreSQL'deki veriler bu uykudan etkilenmez. Ücretsiz PostgreSQL oluşturulduktan **30 gün sonra sona erer** ve ücretsiz yedekleme sunmaz. Değerlendirmeden önce JSON yedeği alın; JSON yalnızca başvuruları içerir, kullanıcı hesaplarını ve oturumları içermez. Değerlendirme bitince iki kaynağı Render panelinden silebilirsiniz.

Kaynaklar: [Render ücretsiz plan](https://render.com/docs/free), [Blueprint kurulumu](https://render.com/docs/infrastructure-as-code), [PostgreSQL bağlantısı](https://render.com/docs/postgresql-creating-connecting).

### Elle Web Service oluşturma

Blueprint yerine **New → Postgres** ile Free veritabanı oluşturup aynı bölgede **New → Web Service** ile depoyu bağlayabilirsiniz. Build: `pnpm install --frozen-lockfile --prod=false && pnpm test && pnpm build`; Start: `pnpm start`; sağlık yolu: `/api/health`. İki kaynak için de **Free** seçin. `DATABASE_URL` değerine PostgreSQL sayfasındaki **Internal Database URL** bilgisini girin. Ortam:

```dotenv
NODE_ENV=production
NODE_VERSION=24
HOST=0.0.0.0
DATABASE_URL=postgresql://KULLANICI:PAROLA@DAHILI_HOST:5432/VERITABANI
# Render dışında zorunlu; Render'da RENDER_EXTERNAL_URL otomatik kullanılır.
# APP_ORIGINS=https://uygulamanizin-alan-adi.example
```

Render HTTPS ve `PORT` değerini sağlar; ayrıca disk bağlamayın. HTTPS Origin adreslerini virgülle, sonunda `/` olmadan yazın. Proxy arkasında hız sınırı doğrudan bağlantı IP'sini kullanır; istemci IP başlıklarına otomatik güvenilmez. Yerel SQLite kayıtları kendiliğinden PostgreSQL'e taşınmaz. Başvuruları yerelden JSON olarak dışa aktarın; canlıda hesap oluşturup içe aktarın.

E-posta doğrulama, e-posta ile parola sıfırlama, sosyal giriş ve AI entegrasyonu bu sürümde yoktur. E-posta sahipliği doğrulanmaz; adres giriş tanımlayıcısıdır. Mülakat saatleri cihazın yerel saatidir. Birden fazla cihazdan erişim aynı sunucuya bağlanıldığında mümkündür; yerel `127.0.0.1` adresi başka cihazlara açılmaz.

## Testler ve klasörler

`pnpm test`: doğrulama, kayıt/giriş, oturum iptali ve süresi, parola değiştirme, kullanıcı yalıtımı, eşzamanlı yazma çatışması, atomik yazma, hız sınırı ve SQLite kalıcılığı. API testleri geçici veritabanı kullanır; kişisel veritabanına dokunmaz.

PostgreSQL API testleri için `TEST_DATABASE_URL` değişkenini bir test PostgreSQL bağlantısına ayarlayıp `pnpm test` çalıştırın. Testler her senaryo için rastgele, ayrı bir şema oluşturup temizler. Bağlantı kullanıcısının şema oluşturma izni olmalıdır. `DATABASE_URL` testlerde kullanılmaz.

- `server/`: HTTP API, oturumlar, SQLite/PostgreSQL bağlantıları ve şemalar
- `scripts/`: geliştirme sunucularını birlikte çalıştırma
- `src/Components`: başvuru formu, kart ve hesap ayarları
- `src/Pages`: pano, takvim, istatistik ve çalışma alanı
- `src/App.tsx`: oturum kontrolü, giriş ve kayıt ekranı
- `src/Interfaces`, `src/lib`: modeller, doğrulama ve API istemcisi
- `tests/`: model ve API bütünleşme testleri
- `docs/`: ekran görüntüleri (ilk pano görselleri önceki yerel sürüme aittir)
