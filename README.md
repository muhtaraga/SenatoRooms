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

## API kullanım rehberi

API varsayılan olarak `http://localhost:4000` adresindedir. İstek ve yanıt gövdeleri aksi belirtilmedikçe JSON'dur. Başarısız istekler `{ "error": "..." }` biçiminde bir gövde döndürür.

### Kimlik doğrulama

Kayıt ve giriş uçları `HttpOnly` oturum çerezi ayarlar. Tarayıcı dışından istek atarken çerezi saklayıp sonraki isteklerde gönderin. Tarayıcı tabanlı istemcilerde çapraz kaynak isteği yapılıyorsa `credentials: "include"` kullanın.

```powershell
# Kaydol ve oturum çerezini api-cookie.txt dosyasına yaz
curl.exe -i -c api-cookie.txt -X POST http://localhost:4000/api/auth/register `
  -H "Content-Type: application/json" `
  -d '{"phone":"5533770000","password":"guclu-parola","displayName":"Ada Lovelace"}'

# Oturum gerektiren istek
curl.exe -b api-cookie.txt http://localhost:4000/api/me
```

Telefon numarası Türkiye cep telefonu biçiminde olmalıdır. Parola 8–72 bayt, görünen ad en fazla 80 karakterdir. İlk kayıt olan hesap `owner` rolünü alır.

### Temel akış

1. `POST /api/auth/register` veya `POST /api/auth/login` ile oturum açın.
2. `GET /api/members?query=...` ile kullanıcı arayın.
3. `POST /api/dm` ile bire bir konuşma oluşturun veya mevcut konuşmayı alın.
4. Ek varsa önce `POST /api/attachments` ile yükleyin, dönen ek kimliklerini `POST /api/messages/:conversationId` isteğine ekleyin.
5. Yeni olayları gerçek zamanlı almak için aynı oturumla Socket.IO bağlantısı açın.

### Uç noktalar

`*` işaretli uç noktalar oturum gerektirir. `:id`, `:conversationId` ve `:memberId` yer tutucularını gerçek UUID değerleriyle değiştirin.

| Yöntem | Yol | İstek gövdesi veya sorgu | Amaç |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | `{ phone, password, displayName }` | Kayıt olur ve oturum açar. |
| POST | `/api/auth/login` | `{ phone, password }` | Oturum açar. |
| POST | `/api/auth/logout` | — | Oturumu kapatır. |
| GET* | `/api/me` | — | Geçerli kullanıcıyı döndürür. |
| PATCH* | `/api/me/profile` | `{ displayName, bio }` | Profili günceller. |
| POST* | `/api/me/photo` | `multipart/form-data`: `photo` | Profil fotoğrafını yükler. |
| GET/PATCH* | `/api/me/settings` | PATCH: tema ve bildirim seçenekleri | Kullanıcı ayarlarını okur/günceller. |
| PATCH* | `/api/me/password` | `{ currentPassword, newPassword }` | Parolayı değiştirir. |
| DELETE* | `/api/me` | `{ password }` | Hesabı siler. |
| GET* | `/api/members?query=ab` | En az 2 karakterli `query` | Üye arar. |
| GET* | `/api/members/:id` | — | Ortak konuşması olan üyenin profilini verir. |
| GET* | `/api/conversations?archived=true` | `archived` isteğe bağlı | Konuşmaları listeler. |
| GET* | `/api/conversations/:id/messages` | `limit` (1–50), `before` | Sayfalı mesaj geçmişini döndürür. |
| POST* | `/api/dm` | `{ memberId }` | Bire bir konuşma oluşturur veya döndürür. |
| POST* | `/api/senates` | Form alanları: `name`, `description`, `memberIds`, isteğe bağlı `photo` | Davetli grup sohbeti oluşturur. |
| PATCH* | `/api/senates/:id` | Form alanları: `name`, `description`, isteğe bağlı `photo` | Kurucunun senato bilgilerini günceller. |
| POST* | `/api/senates/:id/invites` | `{ memberId }` | Yetkili üye davet eder. |
| GET* | `/api/invites` | — | Bekleyen davetleri listeler. |
| POST* | `/api/invites/:id/respond` | `{ action: "accept" \| "decline" \| "block" }` | Daveti yanıtlar. |
| POST* | `/api/senates/:id/permissions` | `{ memberId, canInvite }` | Kurucu, davet yetkisini değiştirir. |
| POST* | `/api/senates/:id/leave` | — | Üye senatodan ayrılır. |
| DELETE* | `/api/senates/:id/members/:memberId` | — | Kurucu üyeyi çıkarır. |
| POST* | `/api/senates/:id/owner` | `{ memberId }` | Kuruculuğu devreder. |
| DELETE* | `/api/senates/:id` | — | Kurucu senatoyu siler. |
| POST* | `/api/messages/:conversationId` | `{ body, attachmentIds, replyToMessageId? }` | Mesaj gönderir. |
| PATCH/DELETE* | `/api/messages/:id` | PATCH: `{ body }` | Gönderen mesajını günceller veya siler. |
| POST* | `/api/messages/:id/read` | — | Mesajı okunmuş işaretler. |
| POST/DELETE* | `/api/messages/:id/reactions` | POST: `{ emoji }` | Tepki ekler; silme yolu `/reactions/:emoji`'dir. |
| PATCH* | `/api/conversations/:id/preferences` | `{ notificationLevel?, mutedUntil?, archived?, clear? }` | Konuşma tercihlerini günceller. |
| GET* | `/api/conversations/:id/media` | — | Konuşmadaki ekleri listeler. |
| GET* | `/api/conversations/:id/messages/search` | `query`, isteğe bağlı `senderId`, `from`, `to` | Mesaj arar. |
| GET/POST/DELETE* | `/api/me/blocks` | POST: `{ memberId }`; DELETE yolu `/:id` | Engellenen üyeleri yönetir. |
| POST* | `/api/attachments` | `multipart/form-data`: `conversationId`, `file` | Mesaja bağlanacak eki yükler. |
| GET* | `/api/attachments/:id` | — | Eki indirir. |
| GET* | `/api/attachments/:id/preview` | — | Görsel/video önizlemesini verir. |
| POST* | `/api/admin/backup` | — | Yalnızca yerel yönetici için yedek oluşturur. |

`memberIds`, form gönderiminde JSON dizisi (ör. `["uuid-1","uuid-2"]`) ya da tekrarlanan alan olarak iletilebilir. Dosya ekleri en fazla 25 MB'dir; bir mesaja en fazla 10 ek bağlanabilir.

### Mesaj ve dosya örneği

```powershell
# Ek yükle
$upload = curl.exe -s -b api-cookie.txt -X POST http://localhost:4000/api/attachments `
  -F "conversationId=<CONVERSATION_ID>" `
  -F "file=@C:\dosyalar\not.pdf" | ConvertFrom-Json

# Eki içeren mesaj gönder
curl.exe -b api-cookie.txt -X POST http://localhost:4000/api/messages/<CONVERSATION_ID> `
  -H "Content-Type: application/json" `
  -d "{\"body\":\"Dosya ektedir.\",\"attachmentIds\":[\"$($upload.attachment.id)\"]}"
```

Yüklenen ek önce gönderen kullanıcının ilgili konuşmasında bekleyen durumda olur; yalnızca aynı kullanıcı, aynı konuşmaya mesaj gönderirken bu eki bağlayabilir.

### Socket.IO olayları

Socket.IO bağlantısı oturum çereziyle kimlik doğrular. Bağlantıdan sonra istemci `conversation:join` olayıyla konuşma kimliğini gönderir. Sunucu `conversation:updated`, `senate:invite`, `message:new`, `message:edited`, `message:deleted`, `message:read`, `message:reaction`, `typing:start` ve `typing:stop` olaylarını yayınlar. İstemci yazma durumunu `typing:start` ve `typing:stop` olaylarıyla konuşma kimliğini göndererek güncelleyebilir.
