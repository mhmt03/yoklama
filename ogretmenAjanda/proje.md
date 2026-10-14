# 📋 Öğretmen Ajandası (Öğretmen - Öğrenci - İdare - Süper Admin) Proje Dokümantasyonu

> **Durum:** Mimari ve İşlev Tasarımı (Karara Bağlandı ve Onaylandı)  
> **Son Güncelleme:** 2026-10-14  
> **Platformlar:** iOS & Android (React Native / Expo SDK 57), Gelecekte Opsiyonel Web  
> **Backend Mimarisi:** C# .NET Core Web API (`server/` klasöründe) - monsterasp.net uyumlu  
> **Veritabanı (Server):** MSSQL / MySQL (monsterasp.net)  
> **Veritabanı (Local):** `expo-sqlite` (UUID / GUID tabanlı, offline-first)  
> **Bildirim Altyapısı:** Expo Push Notifications (Kilitli ekranda da bildirim)  

---

## 1. 🏗️ Mimari ve Veri Akışı Kararları

### A. Backend Mimarisi (`server/` dizini)
- Backend projesi aynı repository içerisinde `server/` klasöründe **C# ASP.NET Core Web API** olarak konumlandırılacak.
- monsterasp.net Windows/IIS altyapısına tam uyumlu, kaynak tüketimi minimum olacak.
- Standart RESTful API uçları (JWT Bearer Token ile yetkilendirme).

### B. Resim Yönetimi ve Boyut Kontrolü
- Admin tarafından PDF veya galeriden resim eklendiğinde önce çözünürlük/boyut kontrolü yapılacak.
- Zaten düşük çözünürlüklü ise işlem yapılmayacak. Boyutu büyükse mobilde (`expo-image-manipulator`) max 300x400 px ve %65-70 kaliteye sıkıştırılacak (20-30 KB hedefi).
- Resimler sunucu veritabanında binary/blob tutulmayacak; sunucu diskinde (`/uploads/schools/{schoolCode}/students/{id}.jpg`) saklanacak.
- Öğretmen ve veli uygulamaları resimleri ilk çekişte yerel dosya sistemine kaydedecek, mükerrer indirmeler önlenecek.

### C. UUID (GUID) Tabanlı Senkronizasyon
- Tüm yerel ve sunucu tablolarında benzersiz ID olarak **UUID (GUID)** kullanılacak.
- Çevrimdışı (offline) iken üretilen veriler (`sync_status: 'DRAFT'`) sunucuya aktarıldığında ID çakışması yaşanmayacak.
- Öğretmen yerelde bir görüş/not veya ödev düzelttiğinde (`sync_status: 'PENDING_UPDATE'`), aynı UUID ile sunucudaki kayıt güncellenecek.

### D. İki Aşamalı Atomik AI İşlemleri (Client-Side Staging)
- Uzun sürebilecek AI ayrıştırmaları (ders programı, e-Okul PDF'ten öğrenci ve resim çıkarma, yıllık plan):
  - Önce tamamen adminin telefonunda yerel bellekte tamamlanacak.
  - İşlem doğrulanıp bitince **tek bir Transaction / Batch Payload** olarak sunucuya iletilecek.
  - Sunucuda yarım kalmış veya bozuk kayıt oluşmayacak.

---

## 2. 👥 Rol, Yetki ve Giriş Mekanizmaları

### 🔄 Rol Ayrımı ve Dinamik Rol/Şapka Seçimi
- **Temel İlke: "Admin bir öğretmen değildir."**
  - Bir eğitimci (örn: Mehmet Hoca) hem **Fizik Öğretmeni** hem de **Okul Admini (Müdür/İdareci)** olabilir.
  - Ancak idarecilik görevi ile derse girip fizik anlatma, yoklama alma ve ödev kontrol etme görevleri birbirinden tamamen farklı iş akışlarıdır.
  - Giriş ekranında kullanıcı o an hangi işi icra edecekse o şapkayı seçerek giriş yapar:
    1. **Öğretmen Modu:** Canlı ders kokpiti, yoklama, defter konusu, ödevler, öğrenci 360° veli görüşmesi.
    2. **Okul Admini Modu:** Okul kodu yönetimi, AI ile çarşaf haftalık program yükleme, öğretmen yetkilendirmeleri ve kurum ayarları.
  - **Kesintisiz Geçiş:** Admin panelinin üstünde tek dokunuşla *"👨‍🏫 Öğretmen Moduna Geç (Derse Gir)"*, öğretmen çekmecesinin içinde ise *"👑 Okul Admin Paneline Geç"* bağlantısı yer alır. Tek tıkla roller arasında geçiş yapılabilir.

### 👑 1. Süper Admin (Sistem Sahibi / Lisans Yöneticisi)
- **Deneme Girişi:** Kullanıcı Adı: `mehmetsuper` | Şifre: `1234` (Ayrıca `mehmet` / `123456` desteklenir).
- **Yetkiler:**
  - **Müşteri (Admin) Yönetimi:** Tüm müşteri adminleri (`CustomerId`), bağlı okulları, öğretmen ve öğrenci sayılarıyla birlikte takip etme.
  - **Kademeli Lisans Uzatma:** Müşterinin lisansını uzattığında (`+1 Yıl`), müşteriye ait **tüm okullar, öğretmenler ve öğrenciler** tek tıkla otomatik olarak uzatılır.
  - 1 yıllık deneme süresini denetleme, dondurma, süre uzatma (+1 yıl).
  - Sistem denetim günlüklerini (Audit Logs) ve okul listelerini izleme.

### 🏢 2. Müşteri & Okul Admini (Müdür / Kurucu)
- **Deneme Girişi:** Kullanıcı Adı: `mehmetadmin` | Şifre: `1234`
- **Müşteri No (`CustomerId`) & İlişki ID (`RelationId`):**
  - Uygulamayı edinen her admin bir **Müşteri**dir (Örn: `MST-10001`).
  - Müşteriye özel benzersiz bir **İlişki ID** (`RelationId`, Örn: `ILK-10001`) atanır.
  - **Birden Fazla Okul Yönetimi:** Bir müşteri admin birden fazla okulu (örn: `Atatürk Anadolu Lisesi - OKL-10001` ve `Cumhuriyet Fen Lisesi - OKL-10002`) aynı panelden tek dokunuşla yönetebilir ve aralarında geçiş yapabilir.
  - Yeni açılan tüm okullar otomatik olarak adminin `CustomerId` ve `RelationId` değerlerini miras alır.
- **Kademeli Lisans Kontrolü (Cascade License Validation):**
  - **Öğrenci Girişi:** Öğrencinin `RelationId`'sine bakılır ➔ Adminin `CustomerId`'sine gidilir ➔ Müşteri Adminin `LicenseExpiresAt` süresi denetlenir.
  - **Öğretmen Girişi:** Okul kodu ile giren öğretmenin `RelationId`'sine bakılır ➔ Adminin `LicenseExpiresAt` süresi denetlenir.
  - **Deneme Süresi:** Deneme sürecinde her admin müşterisine **1 yıllık tam lisans süresi** verilir (`DateTime.UtcNow.AddYears(1)`).
- **Otomatik Öğretmen Tanımlama (Manuel veya Çarşaf Program ile):**
  - Admin öğretmen tanımladığında sistem Türkçe karakter ve branşa göre otomatik kullanıcı adı (Örn: `ahmetkayafizik`) ve varsayılan `1234` şifresi üretir.
  - Öğretmen bu okul aracılığıyla sisteme kaydedildiğinde adminin `RelationId` ve `CustomerId` değerleri öğretmene otomatik atanır.
  - Admin tek dokunuşla bu giriş bilgilerini WhatsApp üzerinden öğretmene gönderebilir.
- Öğrencileri sisteme aktarma (Excel, AI veya manuel) + PDF'ten fotoğrafları ayıklama.
- Okul ders programlarını ve yıllık planları AI ile yükleme.
- Okula bağlanan öğretmenleri onaylama, yetkilendirme ve hatalı sınıf atamalarını düzeltme.

### 👔 3. Okul İdarecisi (Müdür Yardımcısı / Koordinatör)
- Okul içi duyuruları ve idari iletişim akışını yönetme.
- Öğretmen-veli-öğrenci mesajlaşmalarını, bildirim trafiğini ve işlem loglarını denetleme/izleme yetkisi.

### 👨‍🏫 4. Öğretmen (Okula Bağlı veya Bireysel Mod)
- **Deneme Girişi:** Kullanıcı Adı: `mehmetogretmen` | Şifre: `1234` (Branş: Fizik, Kurumsal Okul: `OKL-10001`).
- **Giriş Şekilleri:**
  1. **Kurumsal Giriş (Okul Kodu ile):**
     - Okul Kodu (Örn: `OKL-10001`) + Kullanıcı Adı + Şifre ile giriş yapılır.
     - İdarenin yüklediği yıllık planlar, ders programı ve sınıflar hazır gelir.
     - Kurum içi mesajlaşma ve zümre iletişimi aktiftir.
  2. **Bireysel Mod (Okul Kodu Boş):**
     - Okul kodu boş bırakıldığında öğretmen **Bireysel Modda** başlar.
     - Ders programını, sınıflarını ve yıllık planlarını tamamen kendi belirler ve yönetir.
     - Kurum içi mesajlaşma kapalıdır (bilgilendirici kart gösterilir; istenirse sonradan okul koduna bağlanılabilir).
- **Arayüz:** Mevcut `odevTakip` arayüzü ve akışında, hızlı ve pratik.
- **Yerel Öncelikli Öğrenci Listesi (Local-First):**
  - Öğretmenin uygulamasındaki öğrenci listeleri tamamen cihazdaki yerel SQLite veritabanında tutulur.
  - Öğretmen sisteme öğrenci ekleyebilir veya düzenleyebilir; bu ekleme sunucu tarafındaki resmi veriyi değiştirmez.
- **Sistemden Öğrencileri Çek:**
  - Şube üzerinde ve şube detayında tek tıkla *"Sistemden Öğrencileri Çek"* butonu bulunur.
  - Sunucudaki resmi öğrenci listesi çekilir ve yerel şube güncellenir.
  - **Quiz, Not ve Görüşlerin Korunması:** Eşleştirme öğrenci numarası/ismi ile yapılır. Öğrencinin yerel ID'si korunduğu için öğretmenin girdiği tüm quiz notları, öğrenci görüşleri ve ödev kayıtları **KESİNLİKLE KORUNUR**. Sadece numara, sınıf veya iletişim değişmişse güncellenir.
- **Tüm Sınıfı Sil:**
  - Şubeyi ve şubeye ait TÜM verileri (öğrenciler, görüşler, quiz puanları, ödevler, program) cihazdan kalıcı olarak temizler.
- **Seçici ve Onaylı Bildirimler:**
  - Ödevler otomatik veya manuel olarak veliye/öğrenciye bildirilebilir.
  - Görüş notları hassas olduğu için varsayılan olarak paylaşılmaz; sadece öğretmen açıkça seçerse gönderilir.
  - **Onay Kutusu (Confirmation Modal):** Her bildirim ve veri gönderiminde *"X adet veliye/öğrenciye bildirim gönderilecek. Onaylıyor musunuz?"* uyarısı çıkar, kazara gönderim engellenir.
- **İletişim:**
  - Kilitli ekranda da sesli/titreşimli uyarı veren anlık Push Bildirimi (Expo Notifications).
  - WhatsApp kısayolları (Veli Tel, Öğrenci Tel).
  - İdareciler ve zümre öğretmenleriyle kurum içi mesajlaşma.

### 🎓 5. Öğrenci & Veli (KVKK Uyumlu Sade Giriş)
- **Giriş Adımı:**
  1. Okul Kodu girilir.
  2. Kullanıcı Adı: `Öğrenci Numarası` (Örn: `45` veya `1042`).
  3. Varsayılan Şifre: `aaaa_` + `ogrencino` (Örn: `aaaa_45` veya `aaaa_1042`).
- **Avantajı:** TC Kimlik Numarası sistemde hiç tutulmaz (KVKK cezası riski sıfırlanır). Tek basamaklı numaralarda bile karmaşa olmaz. Veli şifresini unuttuğunda idare zorlanmaz.
- Giriş sonrası kullanıcı dilerse kendi şifresini değiştirebilir.
- **Görüntüleme:** Kendisine ait ödevler, teslim durumları (`Yapıldı`, `Eksik`, `Yapılmadı`), öğretmenlerin gönderdiği resmi görüşler, notlar ve öğretmen mesajları.

---

## 3. 🛡️ Güvenlik, Denetim Günlüğü (Audit Logging) ve Hukuki Güvence

- **Değiştirilemez Günlük Kaydı (Append-Only Log):**
  - Gönderilen her bildirim, ödev teslim kontrolü ve durum değişikliği.
  - Veliye/öğrenciye gönderilen görüş ve notların her düzenlemesinde eski ve yeni değer (`old_value` -> `new_value`).
  - İdare ve öğretmen arası mesajlar, oturum hareketleri.
  - Kayıt detayı: `LogId (UUID)`, `SchoolId`, `UserId`, `UserRole`, `ActionType`, `EntityName`, `EntityId`, `Timestamp (UTC)`, `IPAddress / DeviceInfo`.
- Bu kayıtlar sadece Süper Admin, Okul Admini ve yetkili İdareciler tarafından görüntülenebilir.

---

## 4. 🤖 Yapay Zekâ (AI / Gemini) API Anahtarı Yönetimi

- **Geliştirme / Test Aşaması:** Mevcut projede tanımlı aktif Gemini API anahtarı varsayılan olarak kullanılacak (hızlı test ve geliştirme için).
- **Canlıya Geçiş (Production):** Canlı sürümde varsayılan anahtar boşaltılacak.
- **Hibrit API Anahtarı Seçenekleri:**
  1. **Okul Ortak Anahtarı:** Okul Admini sisteme kurumsal bir Gemini API Anahtarı tanımlar. Okulun öğretmenleri ayarlarından *"Okulumun API Anahtarını Kullan"* seçeneğini aktif ettiğinde bu anahtarı otomatik ve şeffaf olarak kullanırlar (Okul kotaları genelde bir okuldaki öğretmen grubuna rahatlıkla yeterlidir).
  2. **Kişisel Anahtar:** Öğretmen dilerse kendi kişisel Gemini API anahtarını girerek bağımsız çalışabilir.

---

## 5. 🚀 Yenilikçi & Katma Değerli Özellikler (Game-Changer)

### 🪄 A. Tek Dokunuşla Okul İnşası (AI Çarşaf Program Analizi)
- Okullarda idarelerin kullandığı haftalık çarşaf ders programı (bilsa, aSc Timetables vb.) tek bir PDF veya resim olarak admin tarafından yüklenir.
- Gemini AI bu dokümandan tek seferde:
  1. Okuldaki tüm öğretmen isimlerini,
  2. Tüm sınıf ve şubeleri (9-A, 10-B...),
  3. Tüm ders adlarını ve branşları,
  4. Hangi öğretmenin hangi sınıfa hangi saatte girdiğini otomatik çıkarır.
- Okulun tüm omurgası 30 saniye içinde sıfır manuel veri girişiyle kurulur.

### 🕹️ B. "Ders Kokpiti" (Canlı Ders Modu)
- Öğretmen o anki derse girdiğinde telefonunu açtığı anda karşısına günün/saatin dersi çıkar:
  - **Ders Defteri Asistanı:** O haftanın yıllık planındaki kazanım/konu kocaman yazar; tek tıkla kopyalanır ("Bugün Deftere Yazılacak: İtme ve Momentum").
  - **Öğrenci Fotoğraflı Liste:** Öğrencilerin resimleri, numaraları ve isimleri.
  - **Hızlı Aksiyonlar:** Tek dokunuşla hızlı yoklama, ödev kontrolü (`+` / `-`), anlık quiz veya derse katılım yıldızı.
  - **Dersi Bitir & Gönder:** Tek butonla yoklama ve ödev durumu yerel hafızaya mühürlenir, istenirse velilere bildirim paketi onayına düşer.

### 📊 C. "360° Veli Toplantısı & Öğrenci Karnesi"
- Veli toplantısında veya idare görüşmesinde öğretmen arama kutusuna öğrenci no yazar:
  - Tek ekranda: Öğrencinin fotoğrafı, tüm ödev tamamlama oranı (örn: %88), yoklama/devamsızlık sayısı, quiz notları ve öğretmenin aldığı tarihli gözlem/rehberlik notları.
  - **Tek Dokunuşla PDF Karne / WhatsApp:** Öğrencinin durumunu gösteren profesyonel bir PDF karne üretip tek tıkla velinin WhatsApp'ına veya uygulamasına gönderme.

### 📚 D. Zümre Ortak Kütüphanesi & Nöbet Ajandası
- **Ortak Yıllık Plan:** Zümre başkanı veya admin bir kere yüklediğinde, okuldaki tüm branş öğretmenleri aynı plana bağlanır (okul içi standart sağlanır).
- **Nöbet & Görev Hatırlatıcı:** Öğretmenin nöbet günü veya sınav görevi geldiğinde sabah 07:30'da kilitli ekranda akıllı hatırlatıcı.

---

## 6. 🗺️ Geliştirme Yol Haritası & İlerleme Takibi (Checklist)

> *Her tamamlanan adım `[x]` olarak işaretlenecek; oturum veya gün değişse bile kalınan yer buradan anında sürdürülecektir.*

### 📍 FAZ 1: Backend Altyapısı (.NET Core Web API & Veri Modelleri)
- [x] `server/` klasöründe ASP.NET Core Web API projesinin yapılandırılması
- [x] Veri modelleri ve DTO'lar (Schools, Users, Students, Classes, Lessons, Assignments, Notes, AuditLogs, Licenses)
- [x] MSSQL / MySQL / SQLite uyumlu Entity Framework Core DbContext
- [x] JWT Kimlik Doğrulama & Süper Admin Seed (`mehmet` / `123456`)
- [x] REST API Uçları (Auth, School, Sync, Uploads, Logs, Messages)


### 📍 FAZ 2: Mobil Yerel Veritabanı & Hibrit Senkronizasyon (Mobile Core)
- [x] SQLite yerel veritabanının UUID ve `sync_status` alanlarıyla güncellenmesi
- [x] `apiService.ts` ve Senkronizasyon Motoru (Offline-first, DRAFT -> SYNCED)
- [x] Güvenli depolama ve oturum yönetimi (`apiClient.ts`, `saveAuthToken`)
- [x] Resim boyutu kontrolü & istemci optimizasyon servisi (`imageOptimizer.ts`)


### 📍 FAZ 3: Süper Admin & Okul Admini Modülü (Mobil UI)
- [x] Süper Admin Lisans ve Okul Yönetim Paneli & Müşteriler Sekmesi (`SuperAdminScreen.tsx`)
- [x] Müşteri (`CustomerId`) ve İlişki ID (`RelationId`) mimarisi: Tek adminin birden fazla okul yönetebilmesi (`SchoolAdminScreen.tsx`)
- [x] Kademeli Lisans Kontrolü: Öğrenci/Öğretmen ➔ İlişki ID ➔ Müşteri ID ➔ Admin Lisans Doğrulaması (1 Yıllık deneme süresi)
- [x] Süper Admin Müşteri Lisansı Uzatma (Tüm bağlı okulları, öğretmenleri ve öğrencileri tek tıkla uzatma)
- [x] Okul Admini: Öğretmen yönetimi (Elle öğretmen ekleme, düzenleme, silme, şifre sıfırlama, WhatsApp ile iletme)
- [x] Okul Admini: Sınıf & Şube yönetimi (Doğrudan sunucuda sınıf ekleme, öğrenci sayıları, silme)
- [x] Okul Admini: Okul Ders & Müfredat yönetimi (Doğrudan sunucuda ders ekleme, kısa kod, haftalık saat, silme)
- [x] Okul Admini: Öğrenci listeleri (Doğrudan sunucuda öğrenci ekleme, düzenleme, silme, veli arama/WhatsApp)
- [x] Okul Admini: Öğrenci Fotoğrafı Ekleme / Değiştirme (Kamera veya Galeri, istemcide sıkıştırma, sunucuya yükleme)
- [x] Okul Admini: Okul kodu üretimi, öğretmen yetkilendirme ve denetimi (`SchoolAdminScreen.tsx`)
- [x] Okul Admini: AI Çarşaf Ders Programı ile Otomatik Okul Kurulumu (`aiScheduleParser.ts`)
- [x] Okul Admini: e-Okul PDF ve Excel ile Öğrenci & Fotoğraf yükleme (Atomik Client Staging)


### 📍 FAZ 4: Öğretmen Modülü & "Ders Kokpiti" & İletişim
- [x] Canlı Ders Kokpiti: Deftere yazılacak kazanım panosu, fotoğraflı hızlı yoklama & ödev kontrolü (`ClassCockpitScreen.tsx`)
- [x] 360° Öğrenci Raporu & Tek Tıkla PDF Karne (`Student360Modal.tsx`)
- [x] Onay pencereli bildirim gönderimi (Ödev/Görüş) & WhatsApp entegrasyonu
- [x] Okul içi öğretmen-idareci mesajlaşma ekranı (`MessagesScreen.tsx`)


### 📍 FAZ 5: Öğrenci & Veli Modülü
- [x] KVKK Uyumlu Sade Giriş Ekranı (Okul Kodu + `ogrencino` + `aaaa_ogrencino`)
- [x] Öğrenci/Veli Paneli: Ödev takip kartları, öğretmen görüşleri, bildirimler ve mesajlar
- [x] Şifre değiştirme ve profil ekranı


### 📍 FAZ 6: Denetim Günlüğü (Audit Log), Güvenlik & Final
- [x] İdareci & Admin İşlem Denetim Günlüğü Görüntüleme Arayüzü (`SuperAdminScreen.tsx` & Backend AuditLog)
- [x] Testler, lint & typecheck doğrulamaları (.NET 0 error, TypeScript 0 error)
- [x] Otomatik Git Commit ve Push




