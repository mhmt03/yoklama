# yoklamaWeb — Proje Özeti

> **Platform:** ASP.NET Core MVC (.NET 10) | **Veritabanı:** SQLite (`yoklama.db`) | **Kimlik:** ASP.NET Core Identity

---

## 📌 Genel Açıklama

**yoklamaWeb**, sınav yoklama süreçlerini dijitalleştiren bir web uygulamasıdır.
Admin sınavları yönetir, öğrenci-salon atamaları yapar, yoklamacı hesapları oluşturur; yoklamacılar ise kendi salonlarındaki öğrenci devam durumunu sisteme girer.

---

## 🏗️ Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| Framework | ASP.NET Core MVC (.NET 10) |
| Kimlik & Rol | ASP.NET Core Identity |
| Veritabanı | SQLite (`yoklama.db`) |
| ORM | Entity Framework Core 10 |
| Excel İşleme | EPPlus 7, ClosedXML |
| PDF İşleme | iTextSharp |
| Kimlik Doğrulama | Cookie Authentication |

---

## 👥 Roller ve Yetkiler

| Rol | Açıklama | Varsayılan Kullanıcı |
|---|---|---|
| `Admin` | Tüm sistemi yönetir | `admin` / `12345` |
| `Yoklamaci` | Kendi salonundaki yoklamayı yapar | Sınav başına otomatik oluşturulur |
| `SuperYoklamaci` | Genişletilmiş yetkili yoklamacı | `superyoklamaci` / `12345` |

---

## 📂 Dizin Yapısı

```
yoklamaweb/
├── Controllers/
│   ├── AccountController.cs        # Giriş/Çıkış, Legacy kimlik doğrulama
│   ├── AdminController.cs          # Kullanıcı yönetimi (CRUD)
│   ├── ExamController.cs           # Sınav yönetimi + Yoklamacı oluşturma
│   ├── ClassAttendanceController.cs # Sınıf yoklaması CRUD + Excel import/export
│   ├── OgrenciController.cs        # Öğrenci yönetimi + Excel import
│   ├── YoklamaciController.cs      # Yoklamacı paneli (stub)
│   ├── SuperYoklamaciController.cs # SuperYoklamaci paneli (stub)
│   └── HomeController.cs           # Ana sayfa yönlendirmesi
│
├── Models/
│   ├── Exam.cs                     # Sınav: Ad, Tarih, Bina, Süre
│   ├── ExamSeat.cs                 # Koltuk Ataması: Öğrenci + Salon + Sıra + Durum
│   ├── ProctorAssignment.cs        # TemporaryProctor: Yoklamacı-Salon-Şifre eşleşmesi
│   ├── Ogrenci.cs                  # Öğrenci: No, Ad, Soyad, vb.
│   ├── Sinav.cs                    # (Legacy) Sınav modeli
│   ├── Yoklama.cs                  # (Legacy) Yoklama kaydı
│   ├── Yoklamaci.cs                # (Legacy) Yoklamacı tablosu
│   ├── Admin.cs                    # (Legacy) Admin tablosu
│   ├── SuperYoklamaci.cs           # (Legacy) SuperYoklamaci tablosu
│   ├── ClassAttendance.cs          # Sınıf yoklaması: Tarih, Ders, Şube, Yoklamacı
│   ├── ClassAttendanceStudent.cs   # Sınıf yoklaması öğrenci satırı: ÖğrenciNo, Durum
│   ├── AttendanceStatus.cs         # Enum: KontrolEdilmedi, Var, Yok, Gec
│   ├── Sinif.cs                    # (Legacy) Sınıf modeli
│   ├── YoklamaciClass.cs           # (Legacy) Yoklamacı-Sınıf ilişkisi
│   └── AdminUserViewModels.cs      # Admin kullanıcı CRUD ViewModel'leri
│
├── Data/
│   └── AppDbContext.cs             # EF Core DbContext + Identity + İlişkiler
│
├── Views/
│   ├── Account/                    # Login sayfası
│   ├── Admin/                      # Kullanıcı listeleme/oluşturma/düzenleme
│   ├── ClassAttendance/            # Sınıf yoklaması: Index, Create, Details, Edit, ImportExcel
│   ├── Exam/                       # Sınav CRUD + ImportSeats + Proctors
│   ├── Ogrenci/                    # Öğrenci CRUD + Excel import
│   ├── Yoklamaci/                  # Yoklamacı paneli (Index)
│   ├── Home/                       # Ana sayfa
│   └── Shared/                     # Layout, hata sayfaları
│
├── Program.cs                      # Uygulama başlangıcı, DI, seed data
├── yoklamaWeb.csproj               # Proje bağımlılıkları
└── yoklama.db                      # SQLite veritabanı dosyası
```

---

## 🔄 Temel İş Akışları

### 1. Sınav Yönetimi (Admin)
```
Exam/Create → Exam/Details → ImportSeats (Excel upload) → GenerateProctors → Exam/Proctors
```

### 2. Yoklamacı Oluşturma (`GenerateProctors`)
1. Sınavdaki tüm **salon adları** (`ExamSeats.SalonAdi`) listelenir.
2. Her salon için **benzersiz bir kullanıcı adı** üretilir (salon adı sanitize edilir).
3. **Yeni salon** → yeni Identity kullanıcısı + rastgele 5 haneli şifre oluşturulur.
4. **Mevcut salon** → kullanıcı ve şifresi **korunur** (değiştirilmez).
5. Yoklamacı `Yoklamaci` rolüne eklenir; `TemporaryProctors` tablosuna kaydedilir.
6. Proctors listesinde kullanıcı adı + şifre görüntülenir.

### 3. Yoklamacı Girişi
1. Ana sayfada kullanıcı adı + şifre + **"Yoklamaci"** rolü seçilir.
2. Identity ile `PasswordSignInAsync` denenir.
3. Başarılı ise `Yoklamaci/Index`'e yönlendirilir.

### 4. Legacy Kimlik Doğrulama (Fallback)
Identity ile giriş başarısız olursa `ValidateLegacyCredentialsAsync` devreye girer:
- `Yoklamacilar`, `Adminler`, `SuperYoklamacilar` tablolarında plain-text şifre aranır.
- Bulunursa Identity kullanıcısı oluşturulup şifre senkronize edilir.

---

## 🗃️ Veritabanı Şeması (Özet)

```
AspNetUsers          ← Identity kullanıcıları
AspNetRoles          ← Admin, Yoklamaci, SuperYoklamaci
AspNetUserRoles      ← Kullanıcı-Rol eşleşmesi

Exams                ← Sınavlar (Ad, Tarih, Bina, Süre aralığı)
ExamSeats            ← Öğrenci-Salon-Koltuk atamaları (AttendanceStatus)
TemporaryProctors    ← Yoklamacı-Salon-Şifre (ExamId + UserId FK)

ClassAttendances     ← Sınıf yoklaması başlığı (Tarih, Ders, Şube, DersSaati, YoklamaciAdi)
ClassAttendanceStudents ← Sınıf yoklaması öğrenci satırları (OgrenciNo, SinifDuzeyi, Durum, Aciklama)

Ogrenciler           ← Öğrenci kayıtları (PK: OgrenciNo)
Adminler             ← Legacy admin tablosu
Yoklamacilar         ← Legacy yoklamacı tablosu
SuperYoklamacilar    ← Legacy super yoklamacı tablosu
Sinavlar             ← Legacy sınav tablosu
Yoklamalar           ← Legacy yoklama kayıtları (concurrency token: RowVersion)
```

---

## ⚙️ Uygulama Başlatma

```bash
cd yoklamaweb
dotnet run
# → https://localhost:5001/Account/Login
```

**Seed Kullanıcılar** (uygulama ilk açılışta otomatik oluşturulur):

| Kullanıcı Adı | Şifre | Rol |
|---|---|---|
| `admin` | `12345` | Admin |
| `yoklamaci` | `12345` | Yoklamaci |
| `superyoklamaci` | `12345` | SuperYoklamaci |

---

## 🧩 Mevcut Durum

- `Yoklamaci/TakeAttendance` ekranı aktif: yoklama durumu seçilebiliyor, öğrenci notu girilebiliyor, canlı filtreleme çalışıyor.
- `SuperYoklamaci/TakeAttendance` benzer şekilde salon bazlı yoklama yönetimini destekliyor.
- `ExamSeat` modelinde bireysel öğrenci notunu saklayan `Note` alanı mevcut.
- `TemporaryProctor` modelinde `ProctorName`, `ExamNote`, `RoomNote` alanları yer alıyor.
- `Program.cs` içinde SQLite migration uyumlu hale getirildi; eksik sütunlar kontrol ediliyor ve tekrar eden `ADD COLUMN` hataları engelleniyor.
- `SuperYoklamaci/Index` ve `Yoklamaci/Index` ekranlarında gereksiz navbar kaldırılması planlanıyor.

---

## 🐛 Değişiklik Geçmişi

### ✅ [2026-07-08] — Yoklamacı Giriş Şifresi Eşitleme Hatası Düzeltildi
- `Controllers/ExamController.cs`
- Mevcut yoklamacıların şifresi korunarak Identity uyumu sağlandı.

### ✅ [2026-07-09] — Yoklamacı Paneli ve Mobil Kart Düzeni
- `Views/Yoklamaci/Index.cshtml`
- `Views/Yoklamaci/TakeAttendance.cshtml`
- `Controllers/YoklamaciController.cs`
- `Models/YoklamaciViewModels.cs`
- Mobil uyumlu, canlı filtrelemeli yoklama ekranı eklendi.

### ✅ [2026-07-09] — Süper Yoklamacı Modülü
- `Views/SuperYoklamaci/Index.cshtml`
- `Views/SuperYoklamaci/Rooms.cshtml`
- `Views/SuperYoklamaci/TakeAttendance.cshtml`
- `Controllers/SuperYoklamaciController.cs`
- `Models/SuperYoklamaciViewModels.cs`

### ✅ [2026-07-11] — SQLite Migration Fix
- `Program.cs`
- `Migrations/20260711160035_AddMissingExamSeatAndTemporaryProctorColumns.cs`
- SQLite `IF NOT EXISTS` desteği olmayan `ADD COLUMN` hataları düzeltildi; veri tabanı sütun varlığı kontrolü eklendi.

### ✅ [2026-07-12] — Exam index filtre seçeneği syntax düzeltildi
- `Views/Exam/Index.cshtml`
- Razor `selected` ifadesi `option` etiketleri için doğru şekilde render edilecek şekilde güncellendi.

### ✅ [2026-07-12] — ClassAttendance Düzenleme ve Excel Şablon İndirme
- `Controllers/ClassAttendanceController.cs`
  - **Edit (GET/POST)**: Sınıf yoklaması kaydı düzenleme (CRUD). `DbUpdateConcurrencyException` ile eşzamanlılık kontrolü.

### ✅ [2026-07-23] — Pansiyon İşlemleri Görünümleri (Views) Entegrasyonu, Yetkilendirme ve Arayüz Güncellemeleri
- Tüm pansiyon modülü görünümleri (Oda, Öğrenci, Yoklama, Nöbetçi Planı, İzin, Görevli CRUD ekranları) oluşturuldu.
- Giriş yapmadığı sürece navbar yukarıda gizlenecek şekilde `_Layout.cshtml` güncellendi.
- Login formuna "Pansiyon Görevlisi" seçeneği eklendi; veritabanında `PansiyonGorevlisi` ve Identity rolleri seed edildi.
- Pansiyon Görevlisi rolü için sınavlar, normal öğrenciler ve sınıf yoklama menüleri gizlenerek sadece Pansiyon Modülü görünür kılındı.
- Yoklama ve izin işlemlerinde yoklamayı alan/onaylayan görevli ID'si dinamik olarak giriş yapan kullanıcının veritabanı ID'siyle eşleştirildi.

---

## 📋 YENİ MODÜL PLANI: PANSİYON YÖNETİM SİSTEMİ

### 🎯 Hedef
Navbar'a "Pansiyon" menüsü ekleyip, Pansiyon sayfasına girince sol tarafta menü olacak 6 sayfa + Admin Excel Raporu + Mobil Yoklama uygulaması implementasyonu.

### 📋 Yapılacak Sayfalar (7 + 1)

| # | Sayfa | Açıklama | Yetki |
|---|---|---|---|
| 1 | **Öğrenciler** | Pansiyon öğrencileri CRUD + Excel import/export | Admin, PansiyonGorevlisi |
| 2 | **Odalar** | Oda yönetimi (No, Kapasite, Kat, Cinsiyet) + Öğrenci atama | Admin, PansiyonGorevlisi |
| 3 | **Pansiyon Görevlileri** | Görevli CRUD + Rol atama (Admin, Görevli, Nöbetçi) | Admin |
| 4 | **Nöbetçi Listesi** | Haftalık nöbet planı oluşturma + görüntüleme | Admin, PansiyonGorevlisi, Nobetci |
| 5 | **Yoklamalar** | Günlük yoklama girişi (Var/Yok/İzinli/Gecikmeli) | Admin, PansiyonGorevlisi, Nobetci |
| 6 | **İzin Girişi** | Öğrenci izin kayıtları (Başlangıç-Bitiş, Tür, Açıklama) | Admin, PansiyonGorevlisi |
| 7 | **Admin Excel Raporu** | Tüm verilerin Excel export (Admin only) | Admin |
| 8 | **Mobil Yoklama** | Mobil uyumlu yoklama girişi (PWA ready) | Nobetci, PansiyonGorevlisi |

---

### 🗃️ Yeni Veritabanı Tabloları (Models)

#### 1. `PansiyonOgrenci` — Pansiyon Öğrencisi
```csharp
public class PansiyonOgrenci
{
    [Key] public int Id { get; set; }
    [Required, MaxLength(20)] public string OgrenciNo { get; set; } // PK benzeri
    [Required, MaxLength(100)] public string AdSoyad { get; set; }
    [MaxLength(20)] public string SinifDuzeyi { get; set; } // 9, 10, 11, 12
    [MaxLength(10)] public string Sube { get; set; } // A, B, C
    [MaxLength(11)] public string Telefon { get; set; }
    [MaxLength(11)] public string VeliTelefon { get; set; }
    [MaxLength(200)] public string Adres { get; set; }
    public DateTime KayitTarihi { get; set; } = DateTime.UtcNow;
    public bool Aktif { get; set; } = true;
    public int? OdaId { get; set; }
    public Oda Oda { get; set; }
    [Timestamp] public byte[] RowVersion { get; set; }
}
```

#### 2. `Oda` — Oda
```csharp
public class Oda
{
    [Key] public int Id { get; set; }
    [Required, MaxLength(20)] public string OdaNo { get; set; } // Örn: 101, 205
    [Required] public int Kapasite { get; set; } // 2, 3, 4 kişilik
    [Required] public int Kat { get; set; } // 1, 2, 3
    [Required, MaxLength(10)] public string Cinsiyet { get; set; } // Kız / Erkek
    [MaxLength(200)] public string Not { get; set; }
    public bool Aktif { get; set; } = true;
    public ICollection<PansiyonOgrenci> Ogrenciler { get; set; } = new List<PansiyonOgrenci>();
    [Timestamp] public byte[] RowVersion { get; set; }
}
```

#### 3. `PansiyonGorevlisi` — Pansiyon Görevlisi
```csharp
public class PansiyonGorevlisi
{
    [Key] public int Id { get; set; }
    [Required, MaxLength(50)] public string KullaniciAdi { get; set; } // Unique
    [Required, MaxLength(100)] public string AdSoyad { get; set; }
    [MaxLength(11)] public string Telefon { get; set; }
    [MaxLength(100)] public string Email { get; set; }
    [Required, MaxLength(20)] public string Rol { get; set; } // Admin, Gorevli, Nobetci
    [MaxLength(256)] public string SifreHash { get; set; } // Identity ile senkronize
    public bool Aktif { get; set; } = true;
    public DateTime KayitTarihi { get; set; } = DateTime.UtcNow;
    [Timestamp] public byte[] RowVersion { get; set; }
}
```

#### 4. `NobetciPlan` — Nöbetçi Planı
```csharp
public class NobetciPlan
{
    [Key] public int Id { get; set; }
    [Required] public int PansiyonGorevlisiId { get; set; }
    public PansiyonGorevlisi PansiyonGorevlisi { get; set; }
    [Required] public DateTime Tarih { get; set; } // Sadece tarih kısmı
    [Required, MaxLength(20)] public string Vardiya { get; set; } // Sabah, Öğle, Akşam, Gece
    [MaxLength(200)] public string Not { get; set; }
    public DateTime OlusturmaTarihi { get; set; } = DateTime.UtcNow;
    [Timestamp] public byte[] RowVersion { get; set; }
    
    // Unique constraint: PansiyonGorevlisiId + Tarih + Vardiya
}
```

#### 5. `PansiyonYoklama` — Pansiyon Yoklaması
```csharp
public class PansiyonYoklama
{
    [Key] public int Id { get; set; }
    [Required] public int PansiyonOgrenciId { get; set; }
    public PansiyonOgrenci PansiyonOgrenci { get; set; }
    [Required] public DateTime Tarih { get; set; } // Sadece tarih
    [Required, MaxLength(20)] public string Durum { get; set; } // Var, Yok, Izinli, Gecikmeli
    [MaxLength(500)] public string Aciklama { get; set; }
    [Required] public int YoklamaYapanId { get; set; }
    public PansiyonGorevlisi YoklamaYapan { get; set; }
    public DateTime KayitZamani { get; set; } = DateTime.UtcNow;
    [Timestamp] public byte[] RowVersion { get; set; }
    
    // Unique constraint: PansiyonOgrenciId + Tarih
}
```

#### 6. `IzinGirisi` — İzin Girişi
```csharp
public class IzinGirisi
{
    [Key] public int Id { get; set; }
    [Required] public int PansiyonOgrenciId { get; set; }
    public PansiyonOgrenci PansiyonOgrenci { get; set; }
    [Required] public DateTime BaslangicTarihi { get; set; }
    [Required] public DateTime BitisTarihi { get; set; }
    [Required, MaxLength(20)] public string IzinTuru { get; set; } // Saglik, Aile, Diger
    [MaxLength(500)] public string Aciklama { get; set; }
    [Required] public int KaydedenId { get; set; }
    public PansiyonGorevlisi Kaydeden { get; set; }
    public DateTime KayitZamani { get; set; } = DateTime.UtcNow;
    [Timestamp] public byte[] RowVersion { get; set; }
}
```

---

### 🔧 AppDbContext Değişiklikleri

```csharp
// Yeni DbSet'ler
public DbSet<PansiyonOgrenci> PansiyonOgrenciler { get; set; }
public DbSet<Oda> Odalar { get; set; }
public DbSet<PansiyonGorevlisi> PansiyonGorevlileri { get; set; }
public DbSet<NobetciPlan> NobetciPlanlar { get; set; }
public DbSet<PansiyonYoklama> PansiyonYoklamalar { get; set; }
public DbSet<IzinGirisi> IzinGirisleri { get; set; }

// OnModelCreating içinde:
- PansiyonOgrenci.OdaId → Oda.Id (FK, Restrict)
- NobetciPlan.PansiyonGorevlisiId → PansiyonGorevlisi.Id (FK, Cascade)
- PansiyonYoklama.PansiyonOgrenciId → PansiyonOgrenci.Id (FK, Cascade)
- PansiyonYoklama.YoklamaYapanId → PansiyonGorevlisi.Id (FK, Restrict)
- IzinGirisi.PansiyonOgrenciId → PansiyonOgrenci.Id (FK, Cascade)
- IzinGirisi.KaydedenId → PansiyonGorevlisi.Id (FK, Restrict)
- Unique Index: PansiyonOgrenci.OgrenciNo
- Unique Index: Oda.OdaNo
- Unique Index: PansiyonGorevlisi.KullaniciAdi
- Unique Index: NobetciPlan (PansiyonGorevlisiId, Tarih, Vardiya)
- Unique Index: PansiyonYoklama (PansiyonOgrenciId, Tarih)
```

---

### 🎮 Controller Yapısı

| Controller | Actions | ViewModel |
|---|---|---|
| `PansiyonOgrenciController` | Index, Create, Edit, Delete, ImportExcel, ExportExcel | PansiyonOgrenciVM |
| `OdaController` | Index, Create, Edit, Delete, AssignStudents | OdaVM |
| `PansiyonGorevlisiController` | Index, Create, Edit, Delete, ToggleActive | PansiyonGorevlisiVM |
| `NobetciController` | Index, Create, Edit, Delete, WeeklyPlan | NobetciPlanVM |
| `PansiyonYoklamaController` | Index, Create, Edit, BulkEntry, DailyReport | PansiyonYoklamaVM |
| `IzinGirisiController` | Index, Create, Edit, Delete, StudentHistory | IzinGirisiVM |
| `PansiyonAdminController` | ExcelReport (All data export) | - |
| `MobilYoklamaController` | Index (Mobile UI), SubmitAttendance | MobilYoklamaVM |

---

### 🎨 View Yapısı

```
Views/
├── Pansiyon/
│   ├── _PansiyonLayout.cshtml      # Sol menü + navbar (Pansiyon özel)
│   └── _PansiyonSidebar.cshtml     # Partial: Sol menü
├── PansiyonOgrenci/
│   ├── Index.cshtml                # Liste + Filtre + Excel butonları
│   ├── Create.cshtml
│   ├── Edit.cshtml
│   └── _FormPartial.cshtml
├── Oda/
│   ├── Index.cshtml                # Oda kartları + Kapasite göstergesi
│   ├── Create.cshtml
│   ├── Edit.cshtml
│   └── AssignStudents.cshtml       # Öğrenci-oda atama (drag-drop veya checkbox)
├── PansiyonGorevlisi/
│   ├── Index.cshtml
│   ├── Create.cshtml
│   └── Edit.cshtml
├── Nobetci/
│   ├── Index.cshtml                # Haftalık takvim görünümü
│   ├── Create.cshtml
│   ├── Edit.cshtml
│   └── WeeklyPlan.cshtml           # Haftalık plan oluşturma wizard
├── PansiyonYoklama/
│   ├── Index.cshtml                # Günlük liste + Filtre
│   ├── Create.cshtml               # Tek öğrenci girişi
│   ├── BulkEntry.cshtml            # Toplu yoklama girişi (tablo)
│   └── DailyReport.cshtml          # Günlük rapor
├── IzinGirisi/
│   ├── Index.cshtml
│   ├── Create.cshtml
│   ├── Edit.cshtml
│   └── StudentHistory.cshtml       # Öğrenci bazlı izin geçmişi
├── PansiyonAdmin/
│   └── ExcelReport.cshtml          # Admin rapor sayfası
└── MobilYoklama/
    └── Index.cshtml                # Mobil uyumlu (PWA manifest, service worker)
```

---

### 🧭 Navbar & Menü Güncellemeleri

#### `_Layout.cshtml` — Navbar'a "Pansiyon" Menüsü Ekle
```html
<!-- Admin, PansiyonGorevlisi rolleri için görünür -->
<li class="nav-item dropdown">
    <a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">
        <i class="bi bi-house-door"></i> Pansiyon
    </a>
    <ul class="dropdown-menu">
        <li><a class="dropdown-item" asp-controller="PansiyonOgrenci" asp-action="Index">Öğrenciler</a></li>
        <li><a class="dropdown-item" asp-controller="Oda" asp-action="Index">Odalar</a></li>
        <li><a class="dropdown-item" asp-controller="PansiyonGorevlisi" asp-action="Index">Görevliler</a></li>
        <li><a class="dropdown-item" asp-controller="Nobetci" asp-action="Index">Nöbetçi Listesi</a></li>
        <li><a class="dropdown-item" asp-controller="PansiyonYoklama" asp-action="Index">Yoklamalar</a></li>
        <li><a class="dropdown-item" asp-controller="IzinGirisi" asp-action="Index">İzin Girişi</a></li>
        <li><hr class="dropdown-divider"></li>
        <li><a class="dropdown-item" asp-controller="PansiyonAdmin" asp-action="ExcelReport">Admin Excel Raporu</a></li>
        <li><a class="dropdown-item" asp-controller="MobilYoklama" asp-action="Index">Mobil Yoklama</a></li>
    </ul>
</li>
```

#### `Views/Pansiyon/_PansiyonSidebar.cshtml` — Sol Menü (Pansiyon sayfalarında)
```html
<nav class="pansiyon-sidebar">
    <ul class="nav flex-column">
        <li class="nav-item"><a class="nav-link" asp-controller="PansiyonOgrenci" asp-action="Index"><i class="bi bi-people"></i> Öğrenciler</a></li>
        <li class="nav-item"><a class="nav-link" asp-controller="Oda" asp-action="Index"><i class="bi bi-door-open"></i> Odalar</a></li>
        <li class="nav-item"><a class="nav-link" asp-controller="PansiyonGorevlisi" asp-action="Index"><i class="bi bi-person-badge"></i> Görevliler</a></li>
        <li class="nav-item"><a class="nav-link" asp-controller="Nobetci" asp-action="Index"><i class="bi bi-calendar-week"></i> Nöbetçi Listesi</a></li>
        <li class="nav-item"><a class="nav-link" asp-controller="PansiyonYoklama" asp-action="Index"><i class="bi bi-clipboard-check"></i> Yoklamalar</a></li>
        <li class="nav-item"><a class="nav-link" asp-controller="IzinGirisi" asp-action="Index"><i class="bi bi-calendar-x"></i> İzin Girişi</a></li>
        <li class="nav-item"><a class="nav-link" asp-controller="PansiyonAdmin" asp-action="ExcelReport"><i class="bi bi-file-earmark-excel"></i> Admin Excel Raporu</a></li>
        <li class="nav-item"><a class="nav-link" asp-controller="MobilYoklama" asp-action="Index"><i class="bi bi-phone"></i> Mobil Yoklama</a></li>
    </ul>
</nav>
```

---

### 📦 Migration Stratejisi

1. **Yeni Migration Oluştur**: `dotnet ef migrations add AddPansiyonModule`
2. **SQLite Uyumluluğu**: `Program.cs` içindeki `PRAGMA table_info` kontrolü zaten mevcut, yeni migration sorunsuz çalışacak
3. **Seed Data**: `Program.cs` içinde `PansiyonGorevlisi` için varsayılan admin kullanıcısı eklenecek

---

### 📝 Yapılacak İşlemler Sırası

| Sıra | İşlem | Durum |
|---|---|---|
| 1 | Yeni Model sınıfları oluştur (6 model) | ✅ Tamamlandı |
| 2 | AppDbContext'e DbSet'ler ve Fluent API ekle | ✅ Tamamlandı |
| 3 | Migration oluştur ve uygula | ✅ Tamamlandı |
| 4 | ViewModel sınıfları oluştur | ✅ Tamamlandı |
| 5 | Controller'lar oluştur (6 controller) | ✅ Tamamlandı |
| 6 | View'lar oluştur (Oda, Ogrenci, Yoklama, Nobetci, Izin, Gorevli CRUD) | ✅ Tamamlandı |
| 7 | _Layout.cshtml navbar'a ve Login formuna düzenlemeler ekle | ✅ Tamamlandı |
| 8 | Giriş yapan kullanıcının claims/username üzerinden dinamik çözülmesi | ✅ Tamamlandı |
| 9 | Test ve doğrulama | ✅ Tamamlandı |
| 10 | project.md güncelleme | ✅ Tamamlandı |

---

### 🔐 Yetki Matrisi (Role-Based Access)

| Sayfa | Admin | PansiyonGorevlisi | Nobetci |
|---|---|---|---|
| Öğrenciler | ✅ CRUD | ✅ CRUD | ❌ |
| Odalar | ✅ CRUD | ✅ CRUD | ❌ |
| Görevliler | ✅ CRUD | ❌ | ❌ |
| Nöbetçi Listesi | ✅ CRUD | ✅ Görüntüleme | ✅ Görüntüleme |
| Yoklamalar | ✅ CRUD | ✅ CRUD | ✅ Giriş |
| İzin Girişi | ✅ CRUD | ✅ CRUD | ❌ |
| Admin Excel Raporu | ✅ | ❌ | ❌ |
| Mobil Yoklama | ✅ | ✅ | ✅ |

> **Not**: `PansiyonGorevlisi.Rol` alanı ile yetki kontrolü yapılacak. Identity rolleri ile senkronize edilecek.

---

### 📱 Mobil Yoklama (PWA) Özellikleri

- `manifest.json` → `wwwroot/manifest.json`
- `service-worker.js` → `wwwroot/service-worker.js`
- Offline-first: IndexedDB ile yerel saklama, online olduğunda senkronizasyon
- Responsive tasarım (Bootstrap 5)
- Touch-friendly butonlar, büyük input alanları
- Kamera/QR kod okuma (gelecek geliştirme için hazırlık)

---

### 📊 Excel Rapor Formatı (Admin)

| Sayfa | Sütunlar |
|---|---|
| Öğrenciler | OgrenciNo, AdSoyad, SinifDuzeyi, Sube, Telefon, VeliTelefon, Adres, OdaNo, Aktif |
| Odalar | OdaNo, Kapasite, Kat, Cinsiyet, Doluluk, Not |
| Görevliler | KullaniciAdi, AdSoyad, Telefon, Email, Rol, Aktif |
| Nöbetçi Planı | Tarih, Vardiya, GorevliAdi, Not |
| Yoklamalar | Tarih, OgrenciNo, AdSoyad, OdaNo, Durum, Aciklama, YoklamaYapan |
| İzinler | OgrenciNo, AdSoyad, Baslangic, Bitis, Tur, Aciklama, Kaydeden |

---

### ✅ Tamamlandığında Güncellenecekler

- [ ] `project.md` — Bu plan ve tamamlanan işler
- [ ] `Program.cs` — Seed data için PansiyonGorevlisi eklenecek
- [ ] `yoklamaWeb.csproj` — Gerekirse yeni paketler (EPPlus zaten var)
- [ ] Migration dosyası
  - **DownloadTemplate**: EPPlus ile Türkçe başlıklı (`Öğrenci No`, `Ad Soyad`, `Sınıf Düzeyi`, `Şube`) Excel şablonu indirme.
  - **ImportStudents**: Hem Türkçe hem ASCII başlık varyantlarını kabul eder.
- `Views/ClassAttendance/Edit.cshtml`
  - Yeni düzenleme view'i: tüm `ClassAttendance` alanları için form, "Kaydet" ve "İptal" butonları.
- `Views/ClassAttendance/Index.cshtml`
  - Her yoklama kartına **"Düzenle"** butonu eklendi (Detay butonu yanında).
- `Views/ClassAttendance/ImportStudents.cshtml`
  - **"Şablonu İndir"** butonu eklendi.

### ✅ [2026-07-12] — ClassAttendance Öğrenci Modeline Salon ve Sıra Alanları Eklendi
- `Models/ClassAttendanceStudent.cs`
  - `Salon` (string?, MaxLength 20) ve `Sira` (string?, MaxLength 20) nullable özellikleri eklendi.
- `Migrations/20260711220624_AddSalonSiraToClassAttendanceStudent.cs`
  - SQLite migration: `ClassAttendanceStudents` tablosuna `Salon` ve `Sira` sütunları eklendi (NULLABLE).
- `Controllers/ClassAttendanceController.cs`
  - **DownloadTemplate**: Excel şablonu başlıkları `Salon`, `Sıra` sütunları eklendi (6 sütun).
  - **ImportStudents (POST)**: 5. ve 6. sütunlar (Salon, Sıra) parse edilip öğrenci nesnesine atanıyor; `allowedHeaders` genişletildi.
  - **ExportStudents**: Excel export başlıkları ve veri yazımı `Salon`, `Sira` sütunları eklendi.
  - **Details (GET)**: ViewModel projeksiyonuna `Salon`, `Sira` eklendi.
- `Views/ClassAttendance/ImportStudents.cshtml`
  - Format bilgisi 6 sütun olarak güncellendi (Salon, Sıra opsiyonel olarak işaretlendi).
- `Views/ClassAttendance/Details.cshtml`
  - Öğrenci tablosuna `Salon` ve `Sıra` sütunları eklendi; null değerler için "—" gösterimi.
- `Models/ClassAttendanceViewModels.cs`
  - `ClassAttendanceStudentRowViewModel` sınıfına `Salon` ve `Sira` özellikleri eklendi.

### ✅ [2026-07-12] — ClassAttendance Günlük Yoklama Listesi Oluşturma Özelliği
- `Views/ClassAttendance/Details.cshtml`
  - **"Günlük Yoklama Listesi Oluştur"** butonu eklendi.
  - Bootstrap 5 modal ile tarih aralığı seçimi (Başlama Tarihi, Bitiş Tarihi).
  - Client-side validasyon: bitiş tarihi başlangıç tarihinden önce olamaz.
  - Modal bilgi metni: işlem mantığını açıklar (her gün için kopya, isimlendirme, 1 gün geçerlilik).
- `Controllers/ClassAttendanceController.cs`
  - **CreateDailyAttendanceLists (POST)**: Yeni action eklendi.
  - Orijinal yoklama kaydını alır (öğrencilerle birlikte).
  - Seçilen tarih aralığındaki **her gün için** yeni `ClassAttendance` kaydı oluşturur:
    - `Name`: Orijinal ad + " " + tarih (örn: "Matematik Sınavı 2024-01-15")
    - `ValidFrom` = `ValidTo` = o gün (sadece 1 gün geçerli)
    - `OnlyCurrentDayAttendance` = true
    - `BuildingNumber`, `StartTime`, `EndTime` orijinalden kopyalanır
  - Orijinal öğrenci listesi (Salon, Sıra dahil) birebir kopyalanır.
  - İşlem sonrası `Index` sayfasına yönlendirir, başarı mesajı gösterir.
  - Tarih aralığı validasyonu: orijinal yoklama geçerlilik aralığı içinde olmalı.

---

## 🔮 Gelecek Planlar

- Admin tarafında `Exam/Details` sayfası için zenginleştirilmiş yoklama görünümü:
  - Her koltuk ataması için **yoklama durumu** açılır liste
  - **Öğrenci bazlı yoklama notu**
  - **Salon notu**
  - **Yoklamayı alan kişi** adı
  - **Güncelle** butonu ile durum değişikliği
  - Üstte genel **yoklama istatistikleri**
  - `Var` durumundaki satırlar yeşil, `Belirsiz` nötr/beyaz olacak
  - Satır seçilince **salon** ve **sıra** düzenleme veya öğrenciyi **sınavdan silme** mümkün olacak
  - Mobilde satırlar gerektiğinde çift satırlı kartlara dönüşecek
- `SuperYoklamaci/Index` ve `Yoklamaci/Index` ekranlarından gereksiz navbarlar kaldırılacak.

---

*Bu dosya her önemli güncelleme sonrasında revize edilecektir.*
*Son güncelleme: 2026-07-23*

*

