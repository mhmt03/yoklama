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

### 👑 1. Süper Admin (Sistem Sahibi / Lisans Yöneticisi)
- **Başlangıç Girişi:** Kullanıcı Adı: `mehmet` | Şifre: `123456` (Sistem içinden değiştirilebilir).
- **Yetkiler:**
  - Tüm okulları, adminleri ve bağımsız öğretmenleri listeleme.
  - 1 yıllık lisans sürelerini takip etme, dondurma, süre uzatma (+1 yıl).
  - İleride Google Play / App Store IAP entegrasyonu için hazır lisans bayrakları (`is_licensed`, `expires_at`, `receipt_token`).

### 🏢 2. Okul Admini (Müdür / Kurucu)
- En fazla 3 okul tanımlayabilme.
- Otomatik benzersiz **Okul Kodu** üretme.
- Sınıf düzeyleri, şubeler, dersler ve kısa adları belirleme.
- Öğrencileri sisteme aktarma (Excel, AI veya manuel) + PDF'ten fotoğrafları ayıklama.
- Okul ders programlarını ve yıllık planları AI ile yükleme.
- Okula bağlanan öğretmenleri onaylama, yetkilendirme ve hatalı sınıf atamalarını düzeltme.

### 👔 3. Okul İdarecisi (Müdür Yardımcısı / Koordinatör)
- Okul içi duyuruları ve idari iletişim akışını yönetme.
- Öğretmen-veli-öğrenci mesajlaşmalarını, bildirim trafiğini ve işlem loglarını denetleme/izleme yetkisi.

### 👨‍🏫 4. Öğretmen (Okula Bağlı veya Bireysel)
- **Arayüz:** Mevcut `odevTakip` arayüzü ve akışında, hızlı ve pratik.
- **Hazır Veri:** Öğrenci listeleri, fotoğraflar, yıllık planlar ve ders programını okul kodundan tek tıkla çekebilme.
- **Yerel Gizlilik:** Taslak notlar, quiz sonuçları ve kişisel görüşler yerelde gizli kalır.
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
- [ ] SQLite yerel veritabanının UUID ve `sync_status` alanlarıyla güncellenmesi
- [ ] `apiService.ts` ve Senkronizasyon Motoru (Offline-first, DRAFT -> SYNCED)
- [ ] Güvenli depolama ve oturum yönetimi (`roleService`, `authStorage`)
- [ ] Resim boyutu kontrolü & istemci optimizasyon servisi (`imageOptimizer.ts`)

### 📍 FAZ 3: Süper Admin & Okul Admini Modülü (Mobil UI)
- [ ] Süper Admin Lisans ve Okul Yönetim Paneli
- [ ] Okul Admini: Okul kodu üretimi, öğretmen yetkilendirme ve denetimi
- [ ] Okul Admini: AI Çarşaf Ders Programı ile Otomatik Okul Kurulumu (Öğretmen, sınıf, ders otomatik)
- [ ] Okul Admini: e-Okul PDF ve Excel ile Öğrenci & Fotoğraf yükleme (Atomik Client Staging)

### 📍 FAZ 4: Öğretmen Modülü & "Ders Kokpiti" & İletişim
- [ ] Canlı Ders Kokpiti: Deftere yazılacak kazanım panosu, fotoğraflı hızlı yoklama & ödev kontrolü
- [ ] 360° Öğrenci Raporu & Tek Tıkla PDF Karne (Veli toplantısı asistanı)
- [ ] Onay pencereli bildirim gönderimi (Ödev/Görüş) & WhatsApp entegrasyonu
- [ ] Okul içi öğretmen-idareci mesajlaşma ekranı

### 📍 FAZ 5: Öğrenci & Veli Modülü
- [ ] KVKK Uyumlu Sade Giriş Ekranı (Okul Kodu + `ogrencino` + `aaaa_ogrencino`)
- [ ] Öğrenci/Veli Paneli: Ödev takip kartları, öğretmen görüşleri, bildirimler ve mesajlar
- [ ] Şifre değiştirme ve profil ekranı

### 📍 FAZ 6: Denetim Günlüğü (Audit Log), Güvenlik & Final
- [ ] İdareci & Admin İşlem Denetim Günlüğü Görüntüleme Arayüzü
- [ ] Testler, lint & typecheck doğrulamaları
- [ ] Otomatik Git Commit ve Push



