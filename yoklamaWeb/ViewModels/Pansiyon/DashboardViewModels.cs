using System.ComponentModel.DataAnnotations;
using yoklamaWeb.Models;

namespace yoklamaWeb.ViewModels.Pansiyon
{
    /// <summary>
    /// Dashboard ana sayfa için istatistik ViewModel
    /// </summary>
    public class PansiyonIstatistikViewModel
    {
        // Genel İstatistikler
        [Display(Name = "Toplam Öğrenci")]
        public int ToplamOgrenciSayisi { get; set; }

        [Display(Name = "Aktif Öğrenci")]
        public int AktifOgrenciSayisi { get; set; }

        [Display(Name = "Pasif Öğrenci")]
        public int PasifOgrenciSayisi { get; set; }

        [Display(Name = "Toplam Oda")]
        public int ToplamOdaSayisi { get; set; }

        [Display(Name = "Dolu Oda")]
        public int DoluOdaSayisi { get; set; }

        [Display(Name = "Boş Oda")]
        public int BosOdaSayisi { get; set; }

        [Display(Name = "Toplam Kapasite")]
        public int ToplamKapasite { get; set; }

        [Display(Name = "Dolu Kapasite")]
        public int DoluKapasite { get; set; }

        [Display(Name = "Boş Kapasite")]
        public int BosKapasite => ToplamKapasite - DoluKapasite;

        [Display(Name = "Genel Doluluk Oranı (%)")]
        public double GenelDolulukOrani => ToplamKapasite > 0 ? Math.Round((double)DoluKapasite / ToplamKapasite * 100, 1) : 0;

        // Görevli İstatistikleri
        [Display(Name = "Toplam Görevli")]
        public int ToplamGorevliSayisi { get; set; }

        [Display(Name = "Aktif Görevli")]
        public int AktifGorevliSayisi { get; set; }

        [Display(Name = "Bugünkü Nöbetçi Sayısı")]
        public int BugunkuNobetciSayisi { get; set; }

        // Yoklama İstatistikleri (Bugün)
        [Display(Name = "Bugün Toplam Öğrenci")]
        public int BugunToplamOgrenci { get; set; }

        [Display(Name = "Bugün Var Olan")]
        public int BugunVarOlan { get; set; }

        [Display(Name = "Bugün Yok Olan")]
        public int BugunYokOlan { get; set; }

        [Display(Name = "Bugünkü Devam Oranı (%)")]
        public double BugunkuDevamOrani => BugunToplamOgrenci > 0 ? Math.Round((double)BugunVarOlan / BugunToplamOgrenci * 100, 1) : 0;

        // İzin İstatistikleri
        [Display(Name = "Aktif İzin Sayısı")]
        public int AktifIzinSayisi { get; set; }

        [Display(Name = "Bu Ay Toplam İzin")]
        public int BuAyToplamIzin { get; set; }

        // Son Güncelleme
        [Display(Name = "Son Güncelleme")]
        public DateTime SonGuncelleme { get; set; } = DateTime.Now;
    }

    /// <summary>
    /// Oda doluluk grafiği için ViewModel
    /// </summary>
    public class OdaDolulukChartViewModel
    {
        [Display(Name = "Oda Adı")]
        public string OdaAdi { get; set; } = string.Empty;

        [Display(Name = "Oda No")]
        public string OdaNo { get; set; } = string.Empty;

        [Display(Name = "Kapasite")]
        public int Kapasite { get; set; }

        [Display(Name = "Mevcut Öğrenci")]
        public int MevcutOgrenci { get; set; }

        [Display(Name = "Boş Yatak")]
        public int BosYatak => Kapasite - MevcutOgrenci;

        [Display(Name = "Doluluk Oranı (%)")]
        public double DolulukOrani => Kapasite > 0 ? Math.Round((double)MevcutOgrenci / Kapasite * 100, 1) : 0;

        [Display(Name = "Oda Tipi")]
        public string OdaTipi { get; set; } = string.Empty;

        [Display(Name = "Kat")]
        public int Kat { get; set; }

        // Chart.js için renk kodu
        [Display(Name = "Renk Kodu")]
        public string RenkKodu => DolulukOrani >= 90 ? "#dc3545" : DolulukOrani >= 70 ? "#ffc107" : "#28a745";
    }

    /// <summary>
    /// Yoklama trendi grafiği için ViewModel (Son 30 gün)
    /// </summary>
    public class YoklamaTrendChartViewModel
    {
        [Display(Name = "Tarih")]
        public DateTime Tarih { get; set; }

        [Display(Name = "Tarih (String)")]
        public string TarihStr => Tarih.ToString("dd.MM");

        [Display(Name = "Toplam Öğrenci")]
        public int ToplamOgrenci { get; set; }

        [Display(Name = "Var Olan")]
        public int VarOlan { get; set; }

        [Display(Name = "Yok Olan")]
        public int YokOlan { get; set; }

        [Display(Name = "Devam Oranı (%)")]
        public double DevamOrani => ToplamOgrenci > 0 ? Math.Round((double)VarOlan / ToplamOgrenci * 100, 1) : 0;

        [Display(Name = "Hafta Sonu mu?")]
        public bool HaftaSonu => Tarih.DayOfWeek == DayOfWeek.Saturday || Tarih.DayOfWeek == DayOfWeek.Sunday;
    }

    /// <summary>
    /// Görevli yükleme grafiği için ViewModel
    /// </summary>
    public class GorevliYuklemeViewModel
    {
        [Display(Name = "Görevli ID")]
        public int GorevliId { get; set; }

        [Display(Name = "Ad Soyad")]
        public string AdSoyad { get; set; } = string.Empty;

        [Display(Name = "Görev")]
        public string Gorev { get; set; } = string.Empty;

        [Display(Name = "Bu Ay Nöbet Sayısı")]
        public int BuAyNobetSayisi { get; set; }

        [Display(Name = "Geçen Ay Nöbet Sayısı")]
        public int GecenAyNobetSayisi { get; set; }

        [Display(Name = "Toplam Nöbet (Yıl)")]
        public int YilToplamNobet { get; set; }

        [Display(Name = "Ortalama Haftalık Nöbet")]
        public double OrtalamaHaftalikNobet => YilToplamNobet / 52.0;

        [Display(Name = "Yükleme Oranı (%)")]
        public double YuklemeOrani => BuAyNobetSayisi > 0 ? Math.Round((double)BuAyNobetSayisi / 4 * 100, 1) : 0; // 4 hafta varsayımı

        // Chart.js için renk
        [Display(Name = "Renk")]
        public string Renk => YuklemeOrani >= 100 ? "#dc3545" : YuklemeOrani >= 75 ? "#ffc107" : "#28a745";
    }

    /// <summary>
    /// Öğrenci durum özeti kartları için ViewModel
    /// </summary>
    public class OgrenciDurumOzetiViewModel
    {
        [Display(Name = "Başlık")]
        public string Baslik { get; set; } = string.Empty;

        [Display(Name = "Sayı")]
        public int Sayi { get; set; }

        [Display(Name = "İkon")]
        public string Icon { get; set; } = string.Empty;

        [Display(Name = "Renk Sınıfı")]
        public string RenkSinifi { get; set; } = string.Empty; // bg-primary, bg-success, bg-warning, bg-danger, bg-info

        [Display(Name = "Açıklama")]
        public string Aciklama { get; set; } = string.Empty;

        [Display(Name = "Detay Linki")]
        public string? DetayLink { get; set; }
    }

    /// <summary>
    /// Dashboard ana ViewModel - Tüm widget'ları birleştirir
    /// </summary>
    public class PansiyonDashboardViewModel
    {
        [Display(Name = "Genel İstatistikler")]
        public PansiyonIstatistikViewModel Istatistikler { get; set; } = new();

        [Display(Name = "Oda Doluluk Grafiği")]
        public List<OdaDolulukChartViewModel> OdaDolulukGrafik { get; set; } = new();

        [Display(Name = "Yoklama Trendi (Son 30 Gün)")]
        public List<YoklamaTrendChartViewModel> YoklamaTrendi { get; set; } = new();

        [Display(Name = "Görevli Yükleme Grafiği")]
        public List<GorevliYuklemeViewModel> GorevliYukleme { get; set; } = new();

        [Display(Name = "Öğrenci Durum Özetleri")]
        public List<OgrenciDurumOzetiViewModel> OgrenciDurumOzetleri { get; set; } = new();

        [Display(Name = "Bugünkü Nöbetçiler")]
        public List<BugunkuNobetciViewModel> BugunkuNobetciler { get; set; } = new();

        [Display(Name = "Yaklaşan İzinler")]
        public List<YaklasanIzinViewModel> YaklasanIzinler { get; set; } = new();

        [Display(Name = "Son Eklenen Öğrenciler")]
        public List<SonEklenenOgrenciViewModel> SonEklenenOgrenciler { get; set; } = new();

        [Display(Name = "Uyarılar")]
        public List<DashboardUyariViewModel> Uyarilar { get; set; } = new();
    }

    /// <summary>
    /// Bugünkü nöbetçi listesi
    /// </summary>
    public class BugunkuNobetciViewModel
    {
        [Display(Name = "Görevli ID")]
        public int GorevliId { get; set; }

        [Display(Name = "Ad Soyad")]
        public string AdSoyad { get; set; } = string.Empty;

        [Display(Name = "Görev")]
        public string Gorev { get; set; } = string.Empty;

        [Display(Name = "Nöbet Başlangıç")]
        public TimeSpan NobetBaslangic { get; set; }

        [Display(Name = "Nöbet Bitiş")]
        public TimeSpan NobetBitis { get; set; }

        [Display(Name = "Telefon")]
        public string? Telefon { get; set; }

        [Display(Name = "Aktif mi?")]
        public bool AktifMi { get; set; }
    }

    /// <summary>
    /// Yaklaşan izinler (7 gün içinde)
    /// </summary>
    public class YaklasanIzinViewModel
    {
        [Display(Name = "İzin ID")]
        public int IzinId { get; set; }

        [Display(Name = "Öğrenci Ad Soyad")]
        public string OgrenciAdSoyad { get; set; } = string.Empty;

        [Display(Name = "Öğrenci No")]
        public string OgrenciNo { get; set; } = string.Empty;

        [Display(Name = "Oda No")]
        public string? OdaNo { get; set; }

        [Display(Name = "İzin Türü")]
        public string IzinTuru { get; set; } = string.Empty;

        [Display(Name = "Başlangıç")]
        public DateTime BaslangicTarihi { get; set; }

        [Display(Name = "Bitiş")]
        public DateTime BitisTarihi { get; set; }

        [Display(Name = "Kalan Gün")]
        public int KalanGun => (int)(BitisTarihi - DateTime.Today).TotalDays;

        [Display(Name = "Durum")]
        public string Durum => KalanGun < 0 ? "Geçmiş" : KalanGun == 0 ? "Bugün Bitiş" : "Yaklaşıyor";

        [Display(Name = "Durum Rengi")]
        public string DurumRengi => KalanGun < 0 ? "text-muted" : KalanGun == 0 ? "text-danger" : "text-warning";
    }

    /// <summary>
    /// Son eklenen öğrenciler (Son 5)
    /// </summary>
    public class SonEklenenOgrenciViewModel
    {
        [Display(Name = "Öğrenci ID")]
        public int OgrenciId { get; set; }

        [Display(Name = "Ad Soyad")]
        public string AdSoyad { get; set; } = string.Empty;

        [Display(Name = "Öğrenci No")]
        public string OgrenciNo { get; set; } = string.Empty;

        [Display(Name = "Oda No")]
        public string? OdaNo { get; set; }

        [Display(Name = "Sınıf")]
        public int? SinifDuzeyi { get; set; }

        [Display(Name = "Kayıt Tarihi")]
        public DateTime KayitTarihi { get; set; }

        [Display(Name = "Aktif mi?")]
        public bool AktifMi { get; set; }
    }

    /// <summary>
    /// Dashboard uyarıları
    /// </summary>
    public class DashboardUyariViewModel
    {
        public enum UyariTuru
        {
            [Display(Name = "Bilgi")]
            Bilgi,
            [Display(Name = "Uyarı")]
            Uyari,
            [Display(Name = "Tehlike")]
            Tehlike,
            [Display(Name = "Başarı")]
            Basari
        }

        [Display(Name = "Uyarı Türü")]
        public UyariTuru Tur { get; set; } = UyariTuru.Bilgi;

        [Display(Name = "Başlık")]
        public string Baslik { get; set; } = string.Empty;

        [Display(Name = "Mesaj")]
        public string Mesaj { get; set; } = string.Empty;

        [Display(Name = "İkon")]
        public string Icon => Tur switch
        {
            UyariTuru.Bilgi => "bi-info-circle",
            UyariTuru.Uyari => "bi-exclamation-triangle",
            UyariTuru.Tehlike => "bi-x-octagon",
            UyariTuru.Basari => "bi-check-circle",
            _ => "bi-info-circle"
        };

        [Display(Name = "Renk Sınıfı")]
        public string RenkSinifi => Tur switch
        {
            UyariTuru.Bilgi => "alert-info",
            UyariTuru.Uyari => "alert-warning",
            UyariTuru.Tehlike => "alert-danger",
            UyariTuru.Basari => "alert-success",
            _ => "alert-info"
        };

        [Display(Name = "Link")]
        public string? Link { get; set; }

        [Display(Name = "Link Metni")]
        public string? LinkMetni { get; set; }

        [Display(Name = "Oluşturma Zamanı")]
        public DateTime OlusturmaZamani { get; set; } = DateTime.Now;
    }

    /// <summary>
    /// Dashboard filtre ViewModel
    /// </summary>
    public class DashboardFilterViewModel
    {
        [Display(Name = "Başlangıç Tarihi")]
        [DataType(DataType.Date)]
        public DateTime? BaslangicTarihi { get; set; } = DateTime.Today.AddDays(-30);

        [Display(Name = "Bitiş Tarihi")]
        [DataType(DataType.Date)]
        public DateTime? BitisTarihi { get; set; } = DateTime.Today;

        [Display(Name = "Oda Tipi")]
        public int? OdaTipiId { get; set; }

        [Display(Name = "Kat")]
        public int? Kat { get; set; }

        [Display(Name = "Sınıf Düzeyi")]
        public int? SinifDuzeyi { get; set; }

        [Display(Name = "Sadece Aktifler")]
        public bool SadeceAktifler { get; set; } = true;
    }

    /// <summary>
    /// Özet kartlar için ViewModel (4 ana kart)
    /// </summary>
    public class DashboardOzetKartViewModel
    {
        [Display(Name = "Başlık")]
        public string Baslik { get; set; } = string.Empty;

        [Display(Name = "Değer")]
        public string Deger { get; set; } = string.Empty;

        [Display(Name = "Alt Bilgi")]
        public string? AltBilgi { get; set; }

        [Display(Name = "İkon")]
        public string Icon { get; set; } = string.Empty;

        [Display(Name = "Renk")]
        public string Renk { get; set; } = "primary"; // primary, success, warning, danger, info

        [Display(Name = "Trend Yönü")]
        public string TrendYonu { get; set; } = string.Empty; // up, down, stable

        [Display(Name = "Trend Değeri")]
        public string? TrendDegeri { get; set; } // örn: "%12 artış"

        [Display(Name = "Link")]
        public string? Link { get; set; }
    }
}