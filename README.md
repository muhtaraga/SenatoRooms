# SenatoRoom

SenatoRoom; özel bire bir mesajlaşma ve davetli grup sohbetleri (senatolar) için geliştirilmiş, tek sayfalı bir mesajlaşma uygulamasıdır.

## Özellikler

- Telefon numarası ve parola ile kayıt/giriş; Türkiye cep telefonu biçimi doğrulaması
- Bire bir sohbetler ve davet kabulüne dayalı senatolar
- Anlık mesajlar, yazıyor göstergesi, okunma bilgisi, mesaj düzenleme ve silme
- Profil, senato ve mesaj eki görselleri; dosya eki yükleme ve medya önizlemesi
- Mesaj gövdelerinin sunucuda AES-256-GCM ile şifrelenmesi
- Socket.IO ile gerçek zamanlı güncellemeler
- Sayfalanmış mesaj geçmişi ve kullanılmayan eklerin otomatik temizliği
- Yalnızca localhost üzerinden erişilebilen yönetici yedekleme ekranı

## Teknoloji yığını

- React 19 ve Vite
- Node.js, Express 5 ve Socket.IO
- SQLite ve Drizzle ORM
- Yerel dosya depolama (profil fotoğrafları ve ekler)

## Gereksinimler

- Node.js 20 veya üzeri
- npm
- Windows için PowerShell örnekleri aşağıdadır. Diğer işletim sistemlerinde eşdeğer komutları kullanın.

## Yerel kurulum

1. Bağımlılıkları kurun:

   ```powershell
   npm.cmd install
   ```

2. Ortam dosyasını oluşturun ve gizli değerleri ayarlayın:

   ```powershell
   Copy-Item .env.example .env
   ```

   `JWT_SECRET` ve `MESSAGE_ENCRYPTION_KEY` için güçlü ve kalıcı değerler kullanın. `MESSAGE_ENCRYPTION_KEY` değişirse daha önce kaydedilen mesajlar çözülemez; `JWT_SECRET` değişirse mevcut oturumlar geçersiz olur.

3. Veritabanı şemasını uygulayın:

   ```powershell
   npm.cmd run db:migrate
   ```

4. Geliştirme sunucularını başlatın:

   ```powershell
   npm.cmd run dev
   ```

   - Arayüz: `http://localhost:5173`
   - API ve Socket.IO: `http://localhost:4000`

İlk kayıt olan kullanıcı `owner` rolünü alır. Yönetici yedeği oluşturmak için hem `ADMIN_PHONE` ile aynı numaraya sahip oturum hem de localhost üzerinden erişim gerekir.

## Ortam değişkenleri

`.env.example` dosyası başlangıç değerlerini içerir. Üretim ortamında varsayılan/gösterim amaçlı gizli değerleri kullanmayın.

| Değişken | Varsayılan | Açıklama |
| --- | --- | --- |
| `PORT` | `4000` | Express ve Socket.IO portu |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Geliştirme arayüzü için izin verilen CORS kaynağı |
| `DATABASE_URL` | `./data/senatoroom.sqlite` | SQLite veritabanı yolu |
| `JWT_SECRET` | geliştirme değeri | Oturum JWT'lerini imzalar; üretimde zorunludur |
| `MESSAGE_ENCRYPTION_KEY` | geçici değer | Mesaj şifreleme anahtarının girdisi; üretimde zorunludur ve değiştirilmemelidir |
| `UPLOAD_DIR` | `./uploads` | Yüklenen dosyaların dizini |
| `BACKUP_DIR` | `./backups` | Yönetici yedeklerinin dizini |
| `ADMIN_PHONE` | boş | Yerel yönetici yedeği açabilecek kullanıcı numarası |
| `PENDING_ATTACHMENT_TTL_MS` | `86400000` | Mesaja bağlanmamış eklerin saklanma süresi (ms) |

## Komutlar

| Komut | Açıklama |
| --- | --- |
| `npm.cmd run dev` | API ve Vite geliştirme sunucusunu birlikte başlatır |
| `npm.cmd run build` | TypeScript denetimi yapar ve üretim arayüzünü `dist/` içine derler |
| `npm.cmd start` | Uygulamayı tek Express sunucusunda çalıştırır |
| `npm.cmd run db:migrate` | Drizzle migration'larını uygular |
| `npm.cmd run db:generate` | Şema değişikliklerinden yeni migration üretir |
| `npm.cmd test` | Vitest testlerini çalıştırır |

## Üretim çalıştırma

Üretimde Express, derlenmiş arayüzü, API'yi, Socket.IO bağlantısını ve dosya isteklerini aynı porttan sunar:

```powershell
npm.cmd run build
$env:NODE_ENV = "production"
npm.cmd run db:migrate
npm.cmd start
```

`data/`, `uploads/` ve `backups/` dizinlerini kalıcı bir diskte saklayın ve düzenli olarak yedekleyin. Bu dizinler ile `.env` Git'e eklenmemelidir. Uygulamanın dosya ekleri en fazla 25 MB'dir.

Tarayıcı/sistem push bildirimleri ile gerçek sesli veya görüntülü aramalar bu MVP'nin kapsamında değildir.

## Alan adı olmadan yayınlama: Cloudflare Quick Tunnel

Cloudflare Quick Tunnel; alan adı satın almadan, yönlendirici portu açmadan veya Cloudflare hesabı oluşturmadan geçici bir HTTPS adresi verir. Adres yalnızca uygulama ve tünel süreçleri çalıştığı sürece kullanılabilir.

1. Windows üzerinde `cloudflared` yükleyin:

   ```powershell
   winget install --id Cloudflare.cloudflared
   ```

2. Yukarıdaki üretim komutlarıyla uygulamayı başlatın.

3. Aynı proje dizininde ikinci bir PowerShell penceresi açıp tüneli başlatın:

   ```powershell
   cloudflared tunnel --url http://localhost:4000
   ```

4. Komutun gösterdiği `https://...trycloudflare.com` adresini paylaşın. Arayüz, API, Socket.IO ve yüklemeler bu tek adres üzerinden çalışır.

Yerel ağın dışındaki bir cihazla kayıt/giriş, iki kullanıcı arasında mesajlaşma ve dosya yükleme/indirme akışlarını doğrulayın. Bilgisayar açık kalmalı ve iki terminal penceresi de çalışmalıdır. Quick Tunnel adresi her yeniden başlatmada değişir.

## Alan adıyla Cloudflare Tunnel

Sabit bir adres için adlandırılmış tünel kullanın:

```powershell
cloudflared tunnel login
cloudflared tunnel create senatoroom
cloudflared tunnel route dns senatoroom chat.example.com
cloudflared tunnel run --url http://localhost:4000 senatoroom
```

Tüneli `http://localhost:4000` hedefine yönlendirin. Vite yalnızca geliştirme içindir; üretimde Express derlenmiş arayüzü de sunar.
