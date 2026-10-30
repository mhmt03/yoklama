# 📋 Öğretmen Ajandası (Öğretmen - Öğrenci - İdare - Süper Admin) Proje Dokümantasyonu

> **Durum:** Canlıda & Yayında (Web API + Web SPA + Android APK)  
> **Son Güncelleme:** 2026-10-18  
> **Canlı Web Adresi:** [http://ogretmenajanda.runasp.net](http://ogretmenajanda.runasp.net)  
> **Canlı REST API:** [http://ogretmenajanda.runasp.net/api](http://ogretmenajanda.runasp.net/api) | Sağlık Testi: `/health`  
> **Doğrudan APK İndirme:** [http://ogretmenajanda.runasp.net/ogretmenajanda.apk](http://ogretmenajanda.runasp.net/ogretmenajanda.apk)  
> **Sunucu FTP Bilgileri:**  
>   - **FTP Host:** `site99031.siteasp.net`  
>   - **FTP Kullanıcı:** `site99031`  
>   - **FTP Port:** `21`  
>   - **Web Kök Dizini:** `/wwwroot`  
> **Platformlar:** iOS & Android (React Native / Expo SDK 57), Web SPA (React Native for Web)  
> **Backend Mimarisi:** C# ASP.NET Core 10 Web API (`server/OgretmenAjanda.Api`)  
> **Veritabanı (Server & Local):** SQLite (`ogretmenajanda.db`, UUID/GUID tabanlı, offline-first)  
> **Bildirim Altyapısı:** Expo Push Notifications  

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
- [x] Okul Admini: Excel (.XLS / .XLSX) ile Tek Tıkla Toplu Öğrenci & Sınıf Yükleme (`excelStudentParser.ts` - 593 öğrenci ve 21 şube anında aktarım)


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

### 📍 FAZ 7: Canlı Dağıtım, Dinamik Sunucu Ayarları & Aşamalı Çarşaf Analizi
- [x] **Canlı Web & API Sunumu (Tek Çatı Altında):**
  - Expo Web derlemesi (`dist`) doğrudan ASP.NET Core API'sinin `wwwroot` dizinine taşınarak tek sunucuda yayınlandı.
  - IIS için `.apk` ve `.wasm` MIME type eşleştirmeleri (`web.config` ve `Program.cs`) tamamlandı.
  - Tek tıkla paketleme aracı oluşturuldu: [`web_ve_server_paketle.bat`](file:///f:/mehmetg_gmail/developing/react/ogretmenAjanda/web_ve_server_paketle.bat).
- [x] **Canlı FTP Dağıtımı & APK Erişimi:**
  - `site99031.siteasp.net` FTP sunucusuna IIS `app_offline.htm` kilit çözme sistemiyle tam yükleme yapıldı.
  - Üretilen Android Release APK'sı [http://ogretmenajanda.runasp.net/ogretmenajanda.apk](http://ogretmenajanda.runasp.net/ogretmenajanda.apk) adresinden doğrudan indirilebilir hale getirildi.
- [x] **Mobil Uygulama Dinamik Sunucu Ayarları:**
  - Giriş ekranına ([`RoleSelectScreen.tsx`](file:///f:/mehmetg_gmail/developing/react/ogretmenAjanda/src/screens/RoleSelectScreen.tsx)) sağ üst köşeye sunucu ayar butonu eklendi.
  - Sunucu adresi değiştirme, bağlantıyı canlı test etme (`/health`) ve varsayılana sıfırlama modalları bağlandı.
- [x] **Aşamalı ve Kontrollü Çarşaf Program Analizi:**
  - Çarşaf program yüklemeden önce ön analiz seçenek modalı eklendi.
  - Kullanıcı isterse sadece Öğretmen Kadrosu, Sınıflar ve Dersleri ~10 saniyede hızlıca çekebilir; isterse haftalık ders dağılımını analiz ettirebilir.
  - Şube ve öğretmen eksiklikleri için güvenlik doğrulamaları ve birden fazla ders okutan öğretmenlerin doğru branşla eşleştirilmesi kuralı eklendi.

### 📍 FAZ 8: Akıllı Çarşaf Ayrıştırma, Çakışma Denetimi & Canlı Program Editörü
- [x] **Çok Sayfalı PDF Dilimleme & Bellek İçi Sayfa Kesme:**
  - 40+ sayfalık toplu öğretmen programlarında `pdf-lib` ve çift yönlü regex hiyerarşisiyle tam sayfa sayısı tespiti (`countPdfPages`).
  - Kullanıcının belirlediği sayfa aralığını bellekte sıfır kayıpla yeni bir PDF olarak dilimleme (`slicePdfPages`).
  - React Native (Hermes/Buffer) ve Web ortamlarıyla tam uyumlu, optimize `uint8ArrayToBase64` dönüştürücüsü.
- [x] **Çift Kontrollü 8 Slotlu Sabit Gün Izgarası (Grid-Array) & Sözlük Eşleme:**
  - Hücrelerin serbest metin yerine her gün için **tam 8 elemanlı sabit bir dizi** (`["", "", "10/D TRH", "10/D TRH", "", "", "", ""]`) olarak alınması.
  - İndeks numarası (0..7) ile ders saatinin (1..8) matematiksel olarak kilitlenmesi; boş hücrelerin kaymaya yol açmasının kesin olarak önlenmesi.
  - Sayfa altındaki/yanındaki özet tablodan ders kodlarının açık adına (`SEÇMELİ ALMANCA`, `REHBERLİK VE YÖNLENDİRME`) otomatik sözlük dönüşümü.
  - Sayfa altındaki günlük toplam ders saatleriyle (Pzt 4, Salı 6 vb.) haftalık hücre dağılımının sağlaması.
- [x] **Program Doğruluk, Doluluk & Çakışma Analitik Motoru:**
  - Backend API (`/api/sync/schedules/stats`): Şube doluluk yüzdeleri, eksik saatler, şube çakışmaları ve öğretmen çakışmalarının hesaplanması.
  - Şube ve öğretmen bazlı haftalık ders yükü ve dağılım istatistikleri.
- [x] **Kompakt Çakışma ListBox'ı ve Anlık Arama:**
  - Çok sayıda çakışma (50+) durumunda ekranın aşağı uzamasını önleyen, kendi içinde kaydırılabilen (`maxHeight: 260`, `ScrollView nestedScrollEnabled`) kompakt ListBox.
  - Şube, öğretmen veya ders adına göre anlık filtreleme / arama kutusu ve tek tıkla ilgili hücreye yönlendiren "Düzenle ➔" köprüsü.
- [x] **Canlı İnteraktif Ders Programı Editörü:**
  - Hem "Şube Bazlı" hem "Öğretmen Bazlı" haftalık ders programını grid üzerinde canlı görüntüleme.
  - Hücreye tıklandığında açılan düzenleme modalında ders ve öğretmen seçimi için alfabetik aranabilir ListBox seçicileri.
  - Tek tıkla ders silme, boş saate yeni ders atama ve ders saati güncelleme.
- [x] **Bireysel / Tek Öğretmen Programı Güncelleme:**
  - Tüm okul programını silmeden veya baştan taramadan, sadece tek bir öğretmenin el programı fotoğrafı veya PDF'i üzerinden derslerini güncelleme (`parseSingleTeacherScheduleWithAi`).
- [x] **Gemini Canlı Model Dinamik Sorgulama & Kararlılık:**
  - Kullanıcının API anahtarıyla Google API'sinde canlı ve aktif modelleri anlık sorgulama (`fetchAvailableGeminiModels`).
  - Kullanımdan kalkan modellerin otomatik elenmesi ve kararlı modellere (`gemini-flash-latest`, `gemini-pro-latest`) öncelik verilmesi.
- [x] **⚡ Akıllı Çakışma-Boşluk Eşleştirici ve Otomatik Dengeleyici (Auto-Reconcile Engine):**
  - Çakışmalar ile şubelerin boş kalan saatlerini aynı gün içerisinde çapraz analiz eden matematiksel motor (`POST /api/sync/schedules/auto-reconcile`).
  - Çakışan dersi, öğretmenin aynı günde boş olduğu uygun ders saatine otomatik aktarma.
  - Aynı anda hem çakışmayı sıfırlama hem de şubedeki boşluğu doldurarak tam 40/40 doluluğa ulaştırma.
  - **Otomatik Çalışma (Zero-Click):** Program toplu yüklendiğinde (`sync/schedules/batch`) arka planda otomatik devreye girerek çakışmaları kullanıcı tıklamasına gerek kalmadan kendiliğinden çözer.
  - **Yerel Ham Veri Stack Dosyası:** AI tarafından ayrıştırılan tüm ham program yığını telefondaki yerel depolama alanına (`schedule_cache/latest_parsed_schedule.json`) anlık yedeklenir. Kotayı tekrar harcamadan stack üzerinden yeniden yerleşim imkânı sunar.
- [x] **Ders Dağılım ve Saat Çizelgesi (HS) Tabanlı Çapraz Sağlama & Blok Tamamlama:**
  - **Alt Tablo Çözümlemesi:** Her öğretmenin sayfasındaki "Ders Dağılım ve Saat Çizelgesi" özet tablosu taranarak açık ders adları, şubeler, günlük saatler ve `HS` (Haftalık Saat) eksiksiz okundu (`workloadSummary`, `totalWeeklyHours`).
  - **⚡ Akıllı Blok Tamamlama (Self-Healing Grid):** Çizelgedeki günlük ders saati (örn: Salı günü 11/C için 2 saat Beden) ile haftalık ızgara karşılaştırılır. Blok ders tek saate düşmüşse ardışık saate (örn: 3 ise 4'e) otomatik tamamlanır. Sıradaki derslerin (Kimya vb.) erken saate kayması kökten önlenir.
  - **Derslerin Gerçek Haftalık Saatleri (HS):** Seçmeli Fizik'in 4 saat, Beden Eğitimi'nin 2 saat, Seçmeli Klasik Ahlak'ın 1 saat, Edebiyat'ın 5 saat olduğu doğrudan `HS` sütunundan alınarak veritabanındaki ders havuzuna işlendi (`Lesson.WeeklyHours`).
  - **Öğretmen Haftalık Saat (HS) Ön Doğrulama Modalı:** Yükleme öncesinde her öğretmenin belgedeki toplam saati ile ızgaradan çıkarılan saatleri karşılaştıran interaktif sağlama paneli eklendi (`TeacherScheduleVerification`).
- [x] **Kullanıcı Kontrollü İsteğe Bağlı Dengeleme (Multi-Part Upload Compatibility):**
  - Çarşaf programın 2 veya daha fazla kerede (sayfa aralıklarıyla parça parça) yüklenmesi durumunda, henüz okunmayan sayfalardaki derslerin yanlışlıkla "eksik" sanılıp erken tamamlanmasını önlemek için otomatik blok tamamlama motoru varsayılan olarak devre dışı bırakıldı (`autoHealBlocks: false`).
  - Ön seçenekler modalına isteğe bağlı seçim anahtarı (`optAutoHealBlocks`) eklendi.
  - Tüm sayfalar yüklendikten sonra Program Denetimi ekranından tek tıkla (`auto-reconcile`) tüm okul programının bütünsel olarak dengelenmesi sağlandı.
- [x] **Okul Yönetim Paneli Kart Birleştirme:**
  - "Yönettiğiniz Okullar" ve "Öğretmen Bağlantı Kodu" kartları tek bir kompakt kart (`combinedSchoolCard`) olarak birleştirildi; ekran alanı optimize edildi.

### 📍 FAZ 9: Çok Kurumlu (Multi-Tenant) Mimari, Kurum Adı İle Giriş, Lisans & Okul Kotası Yönetimi
- [x] **Kurum Adı / Kodu İle Giriş (Multi-Tenancy & Tenant Isolation):**
  - İlk karşılama ekranına rol seçiminden önce "Kurum Adını Giriniz" doğrulama adımı eklendi (`RoleSelectScreen.tsx`).
  - Kurum doğrulandıktan sonra rol seçim ekranının en üstünde aktif kurum adı, kodu, lisans durumu ve "Kurumu Değiştir ↺" butonu yerleştirildi.
  - "Beni Hatırla" (Remember Me) altyapısı kurularak sonraki açılışlarda doğrudan ilgili kurumun ve kullanıcının paneline girilmesi sağlandı.
  - Farklı şehirlerdeki aynı kullanıcı isimlerinin (örn: Afyon'daki `ahmetsahin` ile Uşak'taki `ahmetsahin`) çakışması `Institution.Code` / `CustomerId` bazlı bileşik indeksleme (`{ CustomerId, Username }`) ile kökten engellendi.
- [x] **Lisans & Okul Kotası Yönetimi (Multi-School per Tenant):**
  - Bir kurumun birden fazla okulu tek bir lisans çatısı altında yönetmesi sağlandı (`Institution` modeli: `MaxSchoolCount`).
  - Kurum admininin açabileceği okul sayısı SuperAdmin'in lisans aşamasında belirlediği kota (`maxSchoolCount`) ile dinamik sınırlandırıldı (`POST /api/schools`).
- [x] **Süper Admin Tam Yetki & Yönetim Paneli:**
  - Süper Admin'e sistemdeki tüm kurumları ve tüm okulları tek merkezden görüntüleme, yeni kurum ve admin hesabı tanımlama, okul kotasını dilediği zaman artırıp azaltma, lisans uzatma ve silme yetkileri kazandırıldı (`SuperAdminScreen.tsx` & `SuperAdminController.cs`).
  - Süper Admin sistem sahibi olduğu için herhangi bir kurum koduna bağlı olmadan doğrudan global giriş yapabilmektedir.

---

## 📍 FAZ 10: Optik Okuma, Sınav Değerlendirme, Konu-Kazanım Analizi & Çoklu Rol Raporlama Modülü

> **Hedef:** `yoklamaWeb` uygulamasındaki optik okuma ve sınav değerlendirme mantığının çok kurumlu (`SchoolId`), modern REST API, zengin grafiksel istatistikler, detaylı konu-kazanım analizli karneler ve esnek rol/görünürlük izinleriyle `ogretmenAjanda` sistemine eksiksiz uyarlanması.  
> **Uygulama Zamanı:** Cumartesi Günü (Kota yenilenmesi sonrası).  
> **Geliştirme Kuralı:** Kodlama yapılmayacak; mevcut plan bu dokümanda olgunlaştırılmıştır.

---

### 🛡️ 1. Veritabanı Güvenlik Yedeği (Ön Koşul - Tamamlandı)
Canlı sunucudan (`site99031.siteasp.net` FTP) en güncel SQLite veritabanı indirilip yerel güvenli depolama dizinine arşivlendi:
- **Zaman Damgalı Yedek:** `backups/live_ogretmenajanda_backup_20261029_203026.db` (1.04 MB)
- **En Son Canlı Kopya:** `backups/live_ogretmenajanda_backup_latest.db`
- **Geri Dönüş Güvencesi:** Cumartesi günkü geliştirme sürecinde olası bir veri uyuşmazlığı durumunda tek tıkla orijinal canlı durumuna geri dönülebilecektir.

---

### 🎯 2. Esnek Rol Yetkileri & Görünürlük Kontrol Mekanizması

Her sınav tanımlanırken veya değerlendirildikten sonra idare tarafından bağımsız olarak yönetilebilen **3 Temel Görünürlük ve Yetki Anahtarı** bulunacaktır:

1. **Öğrenci & Veli Sonuç Görünürlüğü (`IsPublishedToStudents` - Açık/Kapalı):**
   - **Kapalı:** Sınav değerlendirilmiş olsa dahi öğrenci ve veli ekranında sınavla ilgili hiçbir bilgi görünmez.
   - **Açık:** Öğrenci ve veli kendi ekranında sınav puanını, netlerini ve detaylı karnesini görebilir.
2. **Sıralama / Derece Görünürlüğü (`ShowRankingToStudents` - Açık/Kapalı):**
   - **Kapalı:** Öğrenci ve veli kendi doğru/yanlış/net sayılarını ve karnesini görür; ancak okul/şube sıralaması gizlenir (öğrenciler arasında gereksiz yarış/stres oluşması istenmediğinde).
   - **Açık:** Öğrenci kendi ekranında okul derecesini, şube derecesini ve genel katılım sayısını (Örn: *Okul 4.sü / 120 Öğrenci*) görebilir.
3. **Öğretmen Sonuç Erişimi (`IsVisibleToTeachers` - Açık/Kapalı & İzolasyon):**
   - **Kapalı:** Sınav sonuçları sadece idare panelinde kalır.
   - **Açık:** Öğretmenler kendi panellerinden sınav sonuçlarına ve karnelere erişebilir.
   - **Öğretmen İzolasyon Kuralı:** Öğretmenler okulun tamamını değil, **yalnızca kendi derse girdikleri sınıfların ve kendi branş derslerine ait sınav sonuçlarını, soru başarılarını ve istatistiki analizlerini** görebilir.

---

### 📑 3. Konu & Kazanım Analizli Detaylı Öğrenci Karneleri

- **Kazanım Tanımlama Desteği:** Sınav tanımlanırken her bir dersin sorularına ait konu ve kazanımlar sisteme girilebilir (Arayüzden hızlıca veya Excel/şablon yükleyerek).
  - *Örn:* Fizik 1. Soru ➔ "Vektörler ve Bileşke", 2. Soru ➔ "Bağıl Hareket".
- **Kazanım Bazlı Başarı Karnesi:**
  - Öğrencinin optik sonuçları değerlendirildiğinde her konu ve kazanımdaki soru sayısı, doğru, yanlış ve başarı yüzdesi (`%80 Başarılı`, `%25 Geliştirilmeli`, `%0 Eksik Kazanım`) hesaplanır.
  - **Öğrenci & Veli Ekranı:** Renkli kazanım göstergeleri, öğrencinin hangi konularda eksiği olduğunu gösteren rehberlik karnesi.
  - **Öğretmen & İdare Ekranı:** Sınıf genelinde en çok fire verilen konuların ve tekrar edilmesi gereken kazanımların tespiti.

---

### 📊 4. Zengin Görsel İstatistikler ve Başarı Analitikleri

Admin ve branş öğretmenlerinin ekranında görsel zenginliğe sahip (bar chart, pasta dilimi, net dağılım grafikleri) kapsamlı gösterge panelleri yer alacaktır:

1. **Okul Başarı Durumu (Genel Analiz):**
   - Okul genel net ortalaması, puan dağılım grafiği, sınava katılım oranı.
   - Ders bazında okul ortalamaları (Türkçe: 28.4 Net, Matematik: 19.2 Net vb.).
2. **Sınıf / Şube Başarı Durumu (Karşılaştırmalı Analiz):**
   - Şubeler arası net ve puan karşılaştırma grafikleri (Örn: 10-A, 10-B, 10-C net kıyaslamaları).
   - Şube içi derece dağılımları ve şube başarı yüzdeleri.
3. **Ders Ders Başarı Analizi (Branş Odaklı):**
   - Soru zorluk indeksleri: Hangi soru okul/sınıf genelinde kaç kişi tarafından doğru, yanlış veya boş bırakılmış?
   - Çeldirici analizi (A şıkkı yerine neden yoğun olarak D şıkkı işaretlendi?).
   - Öğretmenin kendi sınıfındaki başarı trendi.

---

### 🪄 5. Kullanıcı Dostu Optik Form Tanımlama & Geleceğe Yönelik .FMT / AI Altyapısı

- **Sezgisel Form Tanımlama Arayüzü:**
  - Karmaşık koordinat hesapları yerine görsel ve adım adım form sihirbazı.
  - Sütun başlangıç ve uzunluklarını canlı örnek metin satırı üzerinde seçerek doğrulama.
- **Akıllı .FMT (Optik Format) Dosyası & AI Desteği (Hazırlık):**
  - Kullanıcı ileride elindeki hazır `.fmt` dosyasını sisteme yüklediğinde;
  - Yapay zekâ (AI / Regex Parser motoru) `.fmt` dosyasını çözümleyerek öğrenci numarası, ad soyad, sınıf, kitapçık türü ve tüm derslerin soru sayıları ile sütun koordinatlarını otomatik çıkaracak.
  - Sıfır elle koordinat girişi ile optik form şablonu saniyeler içinde hazır hale gelecektir.

---

### 🏛️ 6. Genişletilmiş Veritabanı Modelleri (`server/OgretmenAjanda.Api/Models/`)

Yeni gereksinimler doğrultusunda tasarlanan EF Core tabloları:

1. **`OptikForm` & `OptikFormDers` (Optik Şablon Tanımı):**
   - `Id: Guid`, `SchoolId: Guid`, `FormAdi: string`
   - `NumaraBaslangic`, `NumaraUzunluk`, `AdSoyadBaslangic`, `AdSoyadUzunluk`, `SinifBaslangic`, `SinifUzunluk`, `KitapcikTuruBaslangic`, `KitapcikTuruUzunluk`
   - `FmtRawContent: string?` *(Gelecekte yüklenecek .fmt dosya içeriği)*
   - `ICollection<OptikFormDers>`: `DersAdi`, `BaslangicSutun`, `KarakterSayisi` (Soru Sayısı), `SiraNo`

2. **`OptikSinav` & `OptikSinavDers` (Sınav, Cevap Anahtarları & Görünürlük İzinleri):**
   - `Id: Guid`, `SchoolId: Guid`, `SinavAdi: string`, `UygulamaTarihi: DateTime`
   - `YanlisDogruyuGotururSayisi: double` (Örn: 4 yanlış 1 doğru, veya 0)
   - `HedefSiniflar: string?`, `KitapcikTurleri: string?`, `OptikFormId: Guid?`
   - 🛡️ **Yeni Görünürlük Alanları:**
     - `IsPublishedToStudents: bool` *(Öğrenci/Veli sınav sonucunu görsün mü? Varsayılan: false)*
     - `ShowRankingToStudents: bool` *(Öğrenci/Veli ekranında okul/şube sırası görünsün mü? Varsayılan: false)*
     - `IsVisibleToTeachers: bool` *(Öğretmenler sınav sonuçlarını görebilsin mi? Varsayılan: true)*
     - `HasKazanimAnalysis: bool` *(Sınavda konu/kazanım analizi aktif mi?)*
   - `ICollection<OptikSinavDers>`: `DersAdi`, `SoruSayisi`, `CevapAnahtariA`, `CevapAnahtariB`, `CevapAnahtariC`, `CevapAnahtariD`

3. **`OptikSoruKazanim` (Konu ve Kazanım Eşleştirmeleri - Yeni):**
   - `Id: Guid`, `SchoolId: Guid`, `OptikSinavId: Guid`
   - `DersAdi: string`, `SoruNo: int`
   - `KonuAdi: string` (Örn: "Trigonometri")
   - `KazanimKodu: string?` (Örn: "11.1.2.1")
   - `KazanimAciklamasi: string?` (Örn: "Trigonometrik fonksiyonların grafiklerini çizer.")

4. **`OptikSinavSonuc` & `OptikSinavSonucDers` (Öğrenci Değerlendirme & Dereceler):**
   - `Id: Guid`, `SchoolId: Guid`, `OptikSinavId: Guid`, `StudentId: Guid?`
   - `OgrenciNo: string`, `AdSoyad: string`, `Sinif: string`, `KitapcikTuru: string`
   - `ToplamDogru: int`, `ToplamYanlis: int`, `ToplamBos: int`, `ToplamNet: double`, `Puan: double?`
   - 🏆 **Derece / Sıralama Alanları:**
     - `OkulSirasi: int?`, `SinifSirasi: int?`, `ToplamKatilimci: int?`
   - `ICollection<OptikSinavSonucDers>`: `DersAdi`, `DogruSayisi`, `YanlisSayisi`, `BosSayisi`, `Net: double`, `OgrenciCevaplari: string`

5. **`OptikSinavSonucKazanim` (Öğrenci Konu-Kazanım Başarı Tablosu - Yeni):**
   - `Id: Guid`, `SchoolId: Guid`, `OptikSinavId: Guid`, `StudentId: Guid?`, `OgrenciNo: string`
   - `DersAdi: string`, `KonuAdi: string`, `KazanimAciklamasi: string?`
   - `ToplamSoru: int`, `DogruSayisi: int`, `YanlisSayisi: int`, `BosSayisi: int`
   - `BasariYuzdesi: double` (Örn: 80.0)

6. **`ClassAttendanceDefinition` & `DailyClassAttendance` (E-Yoklama Modülü):**
   - Sınıf/salon bazlı günlük ve ders saati devamsızlık kayıt modelleri.

---

### 🌐 7. Backend REST API Uç Noktaları (`OptikModulController.cs`)

- `GET /api/Optik/forms?schoolId=...` -> Tanımlı form şablonları
- `POST /api/Optik/forms` -> Yeni form oluşturma / düzenleme
- `POST /api/Optik/forms/parse-fmt` -> *.fmt dosyasından AI / parser ile form koordinatlarını çıkarma (altyapı)*
- `GET /api/Optik/exams?schoolId=...` -> Okul optik sınavları (rol bazlı filtreli)
- `POST /api/Optik/exams` -> Sınav, cevap anahtarları ve görünürlük anahtarlarıyla kayıt
- `PUT /api/Optik/exams/{id}/visibility` -> Öğrenci/Veli ve Öğretmen görünürlük ile sıralama anahtarlarını anlık açma/kapama
- `POST /api/Optik/exams/{id}/kazanimlar` -> Soru bazlı konu ve kazanımları kaydetme
- `POST /api/Optik/evaluate` -> TXT / DAT optik dosyasını işleme, net/puan/sıralama ve kazanım başarılarını hesaplama
- `GET /api/Optik/exams/{id}/results` -> Sınav sonuçları (Admin tümünü, öğretmen sadece dersine girdiği şubeleri görür)
- `GET /api/Optik/exams/{id}/statistics` -> Okul, şube ve ders bazlı görsel grafik veri seti
- `GET /api/Optik/exams/{id}/student-report/{studentId}` -> Öğrencinin detaylı konusu/kazanımı olan karnesi
- `GET /api/Optik/exams/{id}/export-excel` -> Çok sayfalı Excel çıktısı (Genel sıralama, şube listeleri, karne dökümü)

---

### 📱 8. Kullanıcı Arayüzü (UI) Tasarım & Ekran Dağılımı

1. **Okul Admin Paneli (`SchoolAdminScreen.tsx`):**
   - **Optik Formlar Sekmesi:** Şablon listesi, yeni form sihirbazı (.fmt yükleme hazırlığı).
   - **Optik Sınavlar & Okuma Sekmesi:** Sınav oluşturma, cevap anahtarı girme, TXT yükleyip anında değerlendirme.
   - **Görünürlük Ayar Paneli:** Sınav kartı üzerinden tek dokunuşla "Öğrenci/Veliye Aç", "Sıralamayı Göster", "Öğretmenlere Aç" switch anahtarları.
   - **Okul İstatistik & Grafik Ekranı:** Okul ve şube karşılaştırma çubukları, ders başarı pasta grafikleri.
2. **Öğretmen Paneli (`HomeScreen.tsx` / `SideDrawer.tsx` / `Student360Modal.tsx`):**
   - Eğer sınav öğretmene açılmışsa menüde veya ana ekranda **"🎯 Optik Sınav Sonuçlarım"** kartı.
   - Öğretmenin yalnızca kendi girdiği şubelere ait net ortalamaları, konu/kazanım analizleri ve öğrenci karneleri.
3. **Öğrenci & Veli Paneli (`StudentDashboardScreen.tsx`):**
   - İdare izin verdiğinde sınav sonuç kartı: Puan, toplam net, ders bazlı netler.
   - İdare sıralamaya izin verdiyse: Okul ve şube derecesi.
   - **Detaylı Karne Sekmesi:** Hangi dersten hangi kazanımlarda başarılı olunduğu, eksik kalınan konuların renkli dökümü.

---

### 🗓️ 9. Cumartesi Günü Uygulama Sıralaması (Güncellenmiş Checklist)

1. [ ] **Veri Modelleri & EF Core Entegrasyonu:**
   - `OptikForm`, `OptikSinav`, `OptikSoruKazanim`, `OptikSinavSonuc`, `OptikSinavSonucKazanim` modellerinin `server/OgretmenAjanda.Api/Models/` içine eklenmesi.
   - `AppDbContext.cs` üzerinde DbSet ve ilişkilerin tanımlanması.
2. [ ] **Backend Servis & API Denetleyicileri (`OptikModulController.cs`):**
   - Değerlendirme motoru: Ham TXT okuma, net hesabı, okul/şube sıralaması çıkarma, konu-kazanım başarı oranlarını hesaplama.
   - Görünürlük yetkilendirmesi (`IsPublishedToStudents`, `ShowRankingToStudents`, `IsVisibleToTeachers`).
   - Öğretmen ders/şube izolasyon filtresi.
3. [ ] **Okul İdare Paneli Arayüzü (`SchoolAdminScreen.tsx`):**
   - Kullanıcı dostu form tanımlama sihirbazı.
   - Sınav tanımlama, cevap anahtarı, TXT yükleme ve değerlendirme.
   - Görünürlük ve sıralama switch kontrolleri.
   - Okul, şube ve ders bazlı görsel istatistik & grafik bileşenleri.
4. [ ] **Öğretmen Ekranı Entegrasyonu:**
   - Öğretmenin sorumlu olduğu sınıfların sınav sonuçlarını ve kazanım eksiklerini gösteren görünüm.
5. [ ] **Öğrenci & Veli Ekranı Entegrasyonu (`StudentDashboardScreen.tsx`):**
   - İzin verilen sınavların sonuç kartı, sıralama (izinliyse) ve detaylı kazanım karnesi modalı.
6. [ ] **Derleme, FTP Yayınlama & Test:**
   - Backend ve Web build, FTP dağıtımı ve canlı testlerin tamamlanması.

