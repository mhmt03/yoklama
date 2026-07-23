using System.ComponentModel.DataAnnotations;
using yoklamaWeb.Models;
using yoklamaWeb.Models.Enums;
using PansiyonIzin = yoklamaWeb.Models.IzinGirisi;

namespace yoklamaWeb.ViewModels.Pansiyon
{
    public class IzinGirisiListViewModel
    {
        public int Id { get; set; }
        public int PansiyonOgrenciId { get; set; }
        public string OgrenciAdSoyad { get; set; } = string.Empty;
        public string OgrenciNo { get; set; } = string.Empty;
        public string? OdaNo { get; set; }
        public DateTime BaslangicTarihi { get; set; }
        public DateTime BitisTarihi { get; set; }
        public string IzinTuru { get; set; } = string.Empty;
        public string? Aciklama { get; set; }
        public int KaydedenId { get; set; }
        public string KaydedenAdSoyad { get; set; } = string.Empty;
        public DateTime KayitZamani { get; set; }
        public int ToplamGun => (BitisTarihi - BaslangicTarihi).Days + 1;
        public bool Aktif => DateTime.Now >= BaslangicTarihi && DateTime.Now <= BitisTarihi;
        public bool Gecmis => DateTime.Now > BitisTarihi;
        public bool Gelecek => DateTime.Now < BaslangicTarihi;
    }

    public class IzinGirisiCreateViewModel
    {
        [Required(ErrorMessage = "Öğrenci seçiniz")]
        [Display(Name = "Öğrenci")]
        public int PansiyonOgrenciId { get; set; }

        [Required(ErrorMessage = "Başlangıç tarihi zorunludur")]
        [Display(Name = "Başlangıç Tarihi")]
        [DataType(DataType.Date)]
        public DateTime BaslangicTarihi { get; set; } = DateTime.Today;

        [Required(ErrorMessage = "Bitiş tarihi zorunludur")]
        [Display(Name = "Bitiş Tarihi")]
        [DataType(DataType.Date)]
        public DateTime BitisTarihi { get; set; } = DateTime.Today.AddDays(1);

        [Required(ErrorMessage = "İzin türü zorunludur")]
        [StringLength(20, ErrorMessage = "İzin türü en fazla 20 karakter olabilir")]
        [Display(Name = "İzin Türü")]
        public string IzinTuru { get; set; } = "Sağlık"; // Sağlık, Aile, Resmi Tatil, Diğer

        [StringLength(500, ErrorMessage = "Açıklama en fazla 500 karakter olabilir")]
        [Display(Name = "Açıklama")]
        public string? Aciklama { get; set; }
    }

    public class IzinGirisiEditViewModel : IzinGirisiCreateViewModel
    {
        public int Id { get; set; }
        public byte[] RowVersion { get; set; } = Array.Empty<byte>();
    }

    public class IzinGirisiDetailViewModel
    {
        public int Id { get; set; }
        public int PansiyonOgrenciId { get; set; }
        public string OgrenciAdSoyad { get; set; } = string.Empty;
        public string OgrenciNo { get; set; } = string.Empty;
        public string? OdaNo { get; set; }
        public DateTime BaslangicTarihi { get; set; }
        public DateTime BitisTarihi { get; set; }
        public string IzinTuru { get; set; } = string.Empty;
        public string? Aciklama { get; set; }
        public int KaydedenId { get; set; }
        public string KaydedenAdSoyad { get; set; } = string.Empty;
        public DateTime KayitZamani { get; set; }
        public int ToplamGun => (BitisTarihi - BaslangicTarihi).Days + 1;
        public bool Aktif => DateTime.Now >= BaslangicTarihi && DateTime.Now <= BitisTarihi;
        public bool Gecmis => DateTime.Now > BitisTarihi;
        public bool Gelecek => DateTime.Now < BaslangicTarihi;
    }

    public class IzinGirisiFilterViewModel
    {
        public int? OgrenciId { get; set; }
        public int? PansiyonOgrenciId { get; set; }
        public int? OdaId { get; set; }
        public string? IzinTuru { get; set; }
        public IzinTur? Tur { get; set; }
        public IzinDurum? Durum { get; set; }
        public string? Arama { get; set; }
        public DateTime? BaslangicTarihi { get; set; }
        public DateTime? BitisTarihi { get; set; }
        public bool? SadeceAktif { get; set; }
        public int Page { get; set; } = 1;
        public int PageSize { get; set; } = 10;
    }

    // Type aliases for controller compatibility
    public class IzinFilterViewModel : IzinGirisiFilterViewModel { }
    public class IzinCreateViewModel
    {
        [Required(ErrorMessage = "Öğrenci seçiniz")]
        [Display(Name = "Öğrenci")]
        public int OgrenciId { get; set; }
        public int PansiyonOgrenciId { get => OgrenciId; set => OgrenciId = value; }

        [Required(ErrorMessage = "İzin türü zorunludur")]
        [Display(Name = "İzin Türü")]
        public IzinTur Tur { get; set; } = IzinTur.Hastalik;

        [Required(ErrorMessage = "Başlangıç tarihi zorunludur")]
        [Display(Name = "Başlangıç Tarihi")]
        [DataType(DataType.Date)]
        public DateTime BaslangicTarihi { get; set; } = DateTime.Today;

        [Required(ErrorMessage = "Bitiş tarihi zorunludur")]
        [Display(Name = "Bitiş Tarihi")]
        [DataType(DataType.Date)]
        public DateTime BitisTarihi { get; set; } = DateTime.Today.AddDays(1);

        [Display(Name = "Durum")]
        public IzinDurum Durum { get; set; } = IzinDurum.Bekliyor;

        [StringLength(500, ErrorMessage = "Açıklama en fazla 500 karakter olabilir")]
        [Display(Name = "Açıklama")]
        public string? Aciklama { get; set; }
    }
    public class IzinEditViewModel
    {
        public int Id { get; set; }
        [Required(ErrorMessage = "Öğrenci seçiniz")]
        public int OgrenciId { get; set; }
        public int PansiyonOgrenciId { get => OgrenciId; set => OgrenciId = value; }
        [Required]
        public IzinTur Tur { get; set; }
        [Required]
        [DataType(DataType.Date)]
        public DateTime BaslangicTarihi { get; set; } = DateTime.Today;
        [Required]
        [DataType(DataType.Date)]
        public DateTime BitisTarihi { get; set; } = DateTime.Today.AddDays(1);
        public IzinDurum Durum { get; set; } = IzinDurum.Bekliyor;
        [MaxLength(500)]
        public string? Aciklama { get; set; }
        public byte[] RowVersion { get; set; } = Array.Empty<byte>();
    }
    // Replaced alias with full ViewModel definition to match controller expectations
    public class IzinGirisiViewModel
    {
        public int Id { get; set; }
        public int OgrenciId { get; set; }
        public string OgrenciAdSoyad { get; set; } = string.Empty;
        public string OgrenciNo { get; set; } = string.Empty;
        public IzinTur Tur { get; set; }
        public DateTime BaslangicTarihi { get; set; }
        public DateTime BitisTarihi { get; set; }
        public int GunSayisi { get; set; }
        public IzinDurum Durum { get; set; }
        public string? Aciklama { get; set; }
        public int? OnaylayanId { get; set; }
        public string? OnaylayanAdSoyad { get; set; }
        public DateTime? OnayTarihi { get; set; }
        public DateTime OlusturmaTarihi { get; set; }
        public byte[] RowVersion { get; set; } = Array.Empty<byte>();
    }

    public class PansiyonIzinViewModel
    {
        public int Id { get; set; }
        public int OgrenciId { get; set; }
        public string OgrenciAdSoyad { get; set; } = string.Empty;
        public string OgrenciNo { get; set; } = string.Empty;
        public IzinTur Tur { get; set; }
        public DateTime BaslangicTarihi { get; set; }
        public DateTime BitisTarihi { get; set; }
        public int GunSayisi { get; set; }
        public IzinDurum Durum { get; set; }
        public string? Aciklama { get; set; }
        public int? OnaylayanId { get; set; }
        public string? OnaylayanAdSoyad { get; set; }
        public DateTime? OnayTarihi { get; set; }
        public DateTime OlusturmaTarihi { get; set; }
        public byte[] RowVersion { get; set; } = Array.Empty<byte>();
    }

    public class IzinListViewModel
    {
        public List<PansiyonIzinViewModel> Izinler { get; set; } = new();
        public IzinFilterViewModel Filter { get; set; } = new();
    }
}