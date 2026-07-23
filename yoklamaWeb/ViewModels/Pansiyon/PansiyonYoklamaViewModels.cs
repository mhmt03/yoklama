using System.ComponentModel.DataAnnotations;using Microsoft.AspNetCore.Mvc.Rendering;using yoklamaWeb.Models;

namespace yoklamaWeb.ViewModels.Pansiyon
{
    public class PansiyonYoklamaListViewModel
    {
        public int Id { get; set; }
        public int PansiyonOgrenciId { get; set; }
        public string OgrenciAdSoyad { get; set; } = string.Empty;
        public string OgrenciNo { get; set; } = string.Empty;
        public string? OdaNo { get; set; }
        public DateTime Tarih { get; set; }
        public TimeSpan? GirisSaati { get; set; }
        public TimeSpan? CikisSaati { get; set; }
        public bool VarMi { get; set; }
        public string? Aciklama { get; set; }
        public int KaydedenId { get; set; }
        public string KaydedenAdSoyad { get; set; } = string.Empty;
        public DateTime KayitTarihi { get; set; }
    }

    public class PansiyonYoklamaCreateViewModel
    {
        [Required(ErrorMessage = "Öğrenci seçiniz")]
        [Display(Name = "Öğrenci")]
        public int PansiyonOgrenciId { get; set; }
        public int OgrenciId { get => PansiyonOgrenciId; set => PansiyonOgrenciId = value; }

        [Required(ErrorMessage = "Tarih zorunludur")]
        [Display(Name = "Tarih")]
        [DataType(DataType.Date)]
        public DateTime Tarih { get; set; } = DateTime.Today;

        [Display(Name = "Giriş Saati")]
        [DataType(DataType.Time)]
        public TimeSpan? GirisSaati { get; set; }

        [Display(Name = "Çıkış Saati")]
        [DataType(DataType.Time)]
        public TimeSpan? CikisSaati { get; set; }

        [Display(Name = "Var mı?")]
        public bool VarMi { get; set; } = true;

        [StringLength(500, ErrorMessage = "Açıklama en fazla 500 karakter olabilir")]
        [Display(Name = "Açıklama")]
        public string? Aciklama { get; set; }
    }

    public class PansiyonYoklamaEditViewModel : PansiyonYoklamaCreateViewModel
    {
        public int Id { get; set; }
        public byte[] RowVersion { get; set; } = Array.Empty<byte>();
    }

    public class PansiyonYoklamaDetailViewModel
    {
        public int Id { get; set; }
        public int PansiyonOgrenciId { get; set; }
        public string OgrenciAdSoyad { get; set; } = string.Empty;
        public string OgrenciNo { get; set; } = string.Empty;
        public string? OdaNo { get; set; }
        public DateTime Tarih { get; set; }
        public TimeSpan? GirisSaati { get; set; }
        public TimeSpan? CikisSaati { get; set; }
        public bool VarMi { get; set; }
        public string? Aciklama { get; set; }
        public int KaydedenId { get; set; }
        public string KaydedenAdSoyad { get; set; } = string.Empty;
        public DateTime KayitTarihi { get; set; }
    }

    public class PansiyonYoklamaFilterViewModel
    {
        public int? PansiyonOgrenciId { get; set; }
        public int? OgrenciId { get => PansiyonOgrenciId; set => PansiyonOgrenciId = value; }
        public int? OdaId { get; set; }
        public string? Arama { get; set; }
        public DateTime? BaslangicTarihi { get; set; }
        public DateTime? BitisTarihi { get; set; }
        public bool? VarMi { get; set; }
        public bool? SadeceAktif { get; set; }
        public int Page { get; set; } = 1;
        public int PageSize { get; set; } = 20;
    }

    public class TopluYoklamaViewModel
    {
        [Required(ErrorMessage = "Tarih zorunludur")]
        [Display(Name = "Tarih")]
        [DataType(DataType.Date)]
        public DateTime Tarih { get; set; } = DateTime.Today;

        [Required(ErrorMessage = "En az bir öğrenci seçiniz")]
        [Display(Name = "Öğrenciler")]
        public List<TopluYoklamaOgrenciViewModel> Ogrenciler { get; set; } = new();

        [Display(Name = "Tümünü Var Olarak İşaretle")]
        public bool TumunuVarYap { get; set; } = false;
    }

    public class TopluYoklamaOgrenciViewModel
    {
        public int PansiyonOgrenciId { get; set; }
        public string OgrenciNo { get; set; } = string.Empty;
        public string AdSoyad { get; set; } = string.Empty;
        public string? OdaNo { get; set; }
        public bool VarMi { get; set; } = true;
        public TimeSpan? GirisSaati { get; set; }
        public TimeSpan? CikisSaati { get; set; }
        public string? Aciklama { get; set; }
    }

    public class YoklamaRaporuViewModel
    {
        public DateTime BaslangicTarihi { get; set; }
        public DateTime BitisTarihi { get; set; }
        public int? OdaId { get; set; }
        public int? SinifDuzeyi { get; set; }
        public List<OgrenciYoklamaOzetiViewModel> OgrenciOzetleri { get; set; } = new();
        public int ToplamOgrenci { get; set; }
        public int ToplamGun { get; set; }
        public double GenelDevamOrani { get; set; }
    }

    public class OgrenciYoklamaOzetiViewModel
    {
        public int PansiyonOgrenciId { get; set; }
        public string OgrenciNo { get; set; } = string.Empty;
        public string AdSoyad { get; set; } = string.Empty;
        public string? OdaNo { get; set; }
        public int ToplamGun { get; set; }
        public int VarGunSayisi { get; set; }
        public int YokGunSayisi { get; set; }
        public double DevamOrani => ToplamGun > 0 ? Math.Round((double)VarGunSayisi / ToplamGun * 100, 1) : 0;
    }

    // Type aliases for controller compatibility
    public class YoklamaFilterViewModel : PansiyonYoklamaFilterViewModel
    {
        public string? Durum { get; set; }
        public int? YoklamaYapanId { get; set; }
    }
    public class YoklamaCreateViewModel
    {
        [Required(ErrorMessage = "Öğrenci seçiniz")]
        public int PansiyonOgrenciId { get; set; }
        public int OgrenciId { get => PansiyonOgrenciId; set => PansiyonOgrenciId = value; }
        [Required]
        public int YoklamaYapanId { get; set; }
        [Required]
        [DataType(DataType.Date)]
        public DateTime Tarih { get; set; } = DateTime.Today;
        [DataType(DataType.Time)]
        public TimeSpan? Saat { get; set; }
        [Required]
        public string Durum { get; set; } = "Var";
        [MaxLength(500)]
        public string? Aciklama { get; set; }
    }
    public class YoklamaEditViewModel
    {
        public int Id { get; set; }
        [Required(ErrorMessage = "Öğrenci seçiniz")]
        public int PansiyonOgrenciId { get; set; }
        public int OgrenciId { get => PansiyonOgrenciId; set => PansiyonOgrenciId = value; }
        [Required]
        public int YoklamaYapanId { get; set; }
        [Required]
        [DataType(DataType.Date)]
        public DateTime Tarih { get; set; } = DateTime.Today;
        [DataType(DataType.Time)]
        public TimeSpan? Saat { get; set; }
        [Required]
        public string Durum { get; set; } = "Var";
        [MaxLength(500)]
        public string? Aciklama { get; set; }
        public byte[] RowVersion { get; set; } = Array.Empty<byte>();
    }
    public class PansiyonYoklamaViewModel
    {
        public int Id { get; set; }
        public int PansiyonOgrenciId { get; set; }
        public int OgrenciId { get => PansiyonOgrenciId; set => PansiyonOgrenciId = value; }
        public string OgrenciAdSoyad { get; set; } = string.Empty;
        public string OgrenciNo { get; set; } = string.Empty;
        public int YoklamaYapanId { get; set; }
        public string YoklamaYapanAdSoyad { get; set; } = string.Empty;
        public DateTime Tarih { get; set; }
        public TimeSpan? Saat { get; set; }
        public string Durum { get; set; } = string.Empty;
        public string? Aciklama { get; set; }
        public string? OdaNo { get; set; }
        public string? IzinBilgisi { get; set; }
        public byte[] RowVersion { get; set; } = Array.Empty<byte>();
    }

    public class YoklamaListViewModel
    {
        public List<PansiyonYoklamaViewModel> Yoklamalar { get; set; } = new();
        public YoklamaFilterViewModel Filter { get; set; } = new();
    }

    public class GunlukYoklamaViewModel
    {
        public DateTime Tarih { get; set; } = DateTime.Today;
        public int? OdaId { get; set; }
        public List<GunlukYoklamaOgrenciViewModel> Ogrenciler { get; set; } = new();
        public List<SelectListItem> OdaListesi { get; set; } = new();
        public List<SelectListItem> DurumListesi { get; set; } = new();
        public List<PansiyonYoklamaViewModel> Yoklamalar { get; set; } = new();
        public List<PansiyonOgrenciViewModel> TumOgrenciler { get; set; } = new();
    }

    public class GunlukYoklamaOgrenciViewModel
    {
        public int PansiyonOgrenciId { get; set; }
        public string OgrenciNo { get; set; } = string.Empty;
        public string AdSoyad { get; set; } = string.Empty;
        public string? OdaNo { get; set; }
        public bool VarMi { get; set; } = true;
        public TimeSpan? GirisSaati { get; set; }
        public TimeSpan? CikisSaati { get; set; }
        public string? Aciklama { get; set; }
        public int? YoklamaId { get; set; }
    }
}