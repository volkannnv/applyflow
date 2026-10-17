# ApplyFlow

Kullanıcı hesabına özel iş başvurusu ve mülakat takip uygulaması. React, TypeScript, Vite ve Tailwind CSS arayüzü; Node.js HTTP API ve SQLite veritabanı kullanır.

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

`data/applyflow.sqlite` ilk çalıştırmada oluşur. Şema `server/schema.sql` dosyasındadır ve yeniden başlatmalarda mevcut kayıtlar korunur.

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

Bu sürüm yalnızca statik Netlify yüklemesiyle çalışmaz. **Node.js 24+ ve kalıcı disk** sunan bir barındırma gerekir. Tek sunucuda `pnpm build` ardından `pnpm start` ile arayüz ve API aynı kaynaktan sunulur. Üretim ortamı:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=3001
DATABASE_PATH=/persistent-volume/applyflow.sqlite
APP_ORIGINS=https://uygulamanizin-alan-adi.example
```

TLS sonlandıran reverse proxy kullanın; HTTPS Origin adreslerini virgülle, sonunda `/` olmadan yazın. Kalıcı diski `DATABASE_PATH` için bağlayın; geçici dağıtım diski kullanmayın. Tek Node.js uygulama örneği çalıştırın. `APP_ORIGINS` üretimde zorunludur ve HTTPS olmalıdır. Proxy arkasında hız sınırı doğrudan bağlantı IP'sini kullanır; istemci IP başlıklarına otomatik güvenilmez. Bu sürüm henüz internete yayımlanmamıştır.

E-posta doğrulama, e-posta ile parola sıfırlama, sosyal giriş ve AI entegrasyonu bu sürümde yoktur. E-posta sahipliği doğrulanmaz; adres giriş tanımlayıcısıdır. Mülakat saatleri cihazın yerel saatidir. Birden fazla cihazdan erişim aynı sunucuya bağlanıldığında mümkündür; yerel `127.0.0.1` adresi başka cihazlara açılmaz.

## Testler ve klasörler

`pnpm test`: doğrulama, kayıt/giriş, oturum iptali ve süresi, parola değiştirme, kullanıcı yalıtımı, eşzamanlı yazma çatışması, atomik yazma, hız sınırı ve SQLite kalıcılığı. API testleri geçici veritabanı kullanır; kişisel veritabanına dokunmaz.

- `server/`: HTTP API, oturumlar ve SQLite şeması
- `scripts/`: geliştirme sunucularını birlikte çalıştırma
- `src/Components`: başvuru formu, kart ve hesap ayarları
- `src/Pages`: pano, takvim, istatistik ve çalışma alanı
- `src/App.tsx`: oturum kontrolü, giriş ve kayıt ekranı
- `src/Interfaces`, `src/lib`: modeller, doğrulama ve API istemcisi
- `tests/`: model ve API bütünleşme testleri
- `docs/`: ekran görüntüleri (ilk pano görselleri önceki yerel sürüme aittir)
