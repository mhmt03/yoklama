using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Http;
using yoklamaWeb.Models;

namespace yoklamaWeb.ViewModels.Pansiyon
{
    public class PansiyonAyarGenelViewModel
    {
        public int Id { get; set; }

        [Required(ErrorMessage = "Pansiyon adı zorunludur")]
        [StringLength(100, ErrorMessage = "Pansiyon adı en fazla 100 karakter olabilir")]
        [Display(Name = "Pansiyon Adı")]
        public string PansiyonAdi { get; set; } = string.Empty;

        [StringLength(200, ErrorMessage = "Adres en fazla 200 karakter olabilir")]
        [Display(Name = "Adres")]
        public string? Adres { get; set; }

        [StringLength(20, ErrorMessage = "Telefon en fazla 20 karakter olabilir")]
        [Display(Name = "Telefon")]
        [Phone(ErrorMessage = "Geçerli bir telefon numarası giriniz")]
        public string? Telefon { get; set; }

        [StringLength(100, ErrorMessage = "E-posta en fazla 100 karakter olabilir")]
        [Display(Name = "E-posta")]
        [EmailAddress(ErrorMessage = "Geçerli bir e-posta adresi giriniz")]
        public string? Eposta { get; set; }

        [StringLength(500, ErrorMessage = "Açıklama en fazla 500 karakter olabilir")]
        [Display(Name = "Açıklama")]
        public string? Aciklama { get; set; }

        [Display(Name = "Logo")]
        public IFormFile? LogoDosya { get; set; }
        public string? LogoUrl { get; set; }

        [Display(Name = "Aktif")]
        public bool Aktif { get; set; } = true;
    }

    public class PansiyonOdaTipiViewModel
    {
        public int Id { get; set; }

        [Required(ErrorMessage = "Oda tipi adı zorunludur")]
        [StringLength(50, ErrorMessage = "Oda tipi adı en fazla 50 karakter olabilir")]
        [Display(Name = "Oda Tipi Adı")]
        public string Ad { get; set; } = string.Empty;

        [Required(ErrorMessage = "Kapasite zorunludur")]
        [Range(1, 20, ErrorMessage = "Kapasite 1-20 arasında olmalıdır")]
        [Display(Name = "Kapasite")]
        public int Kapasite { get; set; }

        [StringLength(200, ErrorMessage = "Açıklama en fazla 200 karakter olabilir")]
        [Display(Name = "Açıklama")]
        public string? Aciklama { get; set; }

        [Display(Name = "Aktif")]
        public bool Aktif { get; set; } = true;

        public int OdaSayisi { get; set; }
    }

    public class PansiyonOdaTipiListViewModel
    {
        public int Id { get; set; }
        public string Ad { get; set; } = string.Empty;
        public int Kapasite { get; set; }
        public string? Aciklama { get; set; }
        public bool Aktif { get; set; }
        public int OdaSayisi { get; set; }
        public int DoluOdaSayisi { get; set; }
        public int BosOdaSayisi => OdaSayisi - DoluOdaSayisi;
    }

    public class PansiyonBildirimAyarViewModel
    {
        public int Id { get; set; }

        [Display(Name = "E-posta Bildirimleri Aktif")]
        public bool EpostaBildirimAktif { get; set; } = true;

        [Display(Name = "SMS Bildirimleri Aktif")]
        public bool SmsBildirimAktif { get; set; } = false;

        [Display(Name = "Push Bildirimleri Aktif")]
        public bool PushBildirimAktif { get; set; } = true;

        [Display(Name = "Yoklama Eksikliği Bildirimi")]
        public bool YoklamaEksikligiBildir { get; set; } = true;

        [Display(Name = "İzin Onay/Red Bildirimi")]
        public bool IzinOnayRedBildir { get; set; } = true;

        [Display(Name = "Nöbetçi Planı Hatırlatması")]
        public bool NobetciHatirlatma { get; set; } = true;

        [Display(Name = "Günlük Özet Raporu")]
        public bool GunlukOzetRaporu { get; set; } = false;

        [Display(Name = "Haftalık Özet Raporu")]
        public bool HaftalikOzetRaporu { get; set; } = true;

        [Display(Name = "E-posta Gönderim Saati")]
        [DataType(DataType.Time)]
        public TimeSpan EpostaGonderimSaati { get; set; } = new TimeSpan(8, 0, 0);

        [StringLength(500, ErrorMessage = "E-posta alıcıları en fazla 500 karakter olabilir")]
        [Display(Name = "E-posta Alıcıları (virgülle ayrılmış)")]
        public string? EpostaAlicilari { get; set; }
    }

    public class PansiyonYemekAyarViewModel
    {
        public int Id { get; set; }

        [Display(Name = "Kahvaltı Saati")]
        [DataType(DataType.Time)]
        public TimeSpan KahvaltiSaati { get; set; } = new TimeSpan(7, 30, 0);

        [Display(Name = "Öğle Yemeği Saati")]
        [DataType(DataType.Time)]
        public TimeSpan OgleYemegiSaati { get; set; } = new TimeSpan(12, 30, 0);

        [Display(Name = "Akşam Yemeği Saati")]
        [DataType(DataType.Time)]
        public TimeSpan AksamYemegiSaati { get; set; } = new TimeSpan(18, 30, 0);

        [Display(Name = "Ara Öğün Saati")]
        [DataType(DataType.Time)]
        public TimeSpan? AraOgunSaati { get; set; } = new TimeSpan(16, 0, 0);

        [Display(Name = "Yemek Listesi Haftalık Güncellenir")]
        public bool HaftalikYemekListesi { get; set; } = true;

        [Display(Name = "Özel Diyet Takibi")]
        public bool OzelDiyetTakibi { get; set; } = true;

        [StringLength(1000, ErrorMessage = "Notlar en fazla 1000 karakter olabilir")]
        [Display(Name = "Notlar")]
        public string? Notlar { get; set; }
    }

    public class PansiyonGuvenlikAyarViewModel
    {
        public int Id { get; set; }

        [Display(Name = "Kapı Giriş Saati")]
        [DataType(DataType.Time)]
        public TimeSpan KapiGirisSaati { get; set; } = new TimeSpan(6, 0, 0);

        [Display(Name = "Kapı Kapanış Saati")]
        [DataType(DataType.Time)]
        public TimeSpan KapiKapanisSaati { get; set; } = new TimeSpan(23, 0, 0);

        [Display(Name = "Gece Geç Giriş İzni")]
        public bool GeceGecGirisIzni { get; set; } = false;

        [Display(Name = "Gece Geç Giriş Bitiş Saati")]
        [DataType(DataType.Time)]
        public TimeSpan GeceGecGirisBitisSaati { get; set; } = new TimeSpan(1, 0, 0);

        [Display(Name = "Ziyaretçi Giriş İzni")]
        public bool ZiyaretciGirisIzni { get; set; } = true;

        [Display(Name = "Ziyaretçi Giriş Başlangıç")]
        [DataType(DataType.Time)]
        public TimeSpan ZiyaretciGirisBaslangic { get; set; } = new TimeSpan(9, 0, 0);

        [Display(Name = "Ziyaretçi Giriş Bitiş")]
        [DataType(DataType.Time)]
        public TimeSpan ZiyaretciGirisBitis { get; set; } = new TimeSpan(21, 0, 0);

        [Display(Name = "Kamera Kayıt Süresi (Gün)")]
        [Range(1, 365, ErrorMessage = "Kamera kayıt süresi 1-365 gün arasında olmalıdır")]
        public int KameraKayitSuresiGun { get; set; } = 30;

        [Display(Name = "Acil Durum Bildirimi")]
        public bool AcilDurumBildirimi { get; set; } = true;

        [StringLength(500, ErrorMessage = "Acil durum notları en fazla 500 karakter olabilir")]
        [Display(Name = "Acil Durum Notları")]
        public string? AcilDurumNotlari { get; set; }
    }

    public class PansiyonAyarIndexViewModel
    {
        public PansiyonAyarGenelViewModel Genel { get; set; } = new();
        public List<PansiyonOdaTipiListViewModel> OdaTipleri { get; set; } = new();
        public PansiyonBildirimAyarViewModel Bildirim { get; set; } = new();
        public PansiyonYemekAyarViewModel Yemek { get; set; } = new();
        public PansiyonGuvenlikAyarViewModel Guvenlik { get; set; } = new();
    }
}