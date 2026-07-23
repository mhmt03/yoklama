using System.ComponentModel.DataAnnotations;
using yoklamaWeb.Models;

namespace yoklamaWeb.ViewModels.Pansiyon
{
    public class PansiyonOgrenciListViewModel
    {
        public List<PansiyonOgrenciViewModel> Ogrenciler { get; set; } = new();
        public PansiyonOgrenciFilterViewModel Filter { get; set; } = new();
    }

    public class PansiyonOgrenciCreateViewModel
    {
        [Required(ErrorMessage = "Öğrenci numarası zorunludur")]
        [StringLength(20, ErrorMessage = "Öğrenci numarası en fazla 20 karakter olabilir")]
        [Display(Name = "Öğrenci No")]
        public string OgrenciNo { get; set; } = string.Empty;

        [Required(ErrorMessage = "Ad Soyad zorunludur")]
        [StringLength(100, ErrorMessage = "Ad Soyad en fazla 100 karakter olabilir")]
        [Display(Name = "Ad Soyad")]
        public string AdSoyad { get; set; } = string.Empty;

[Display(Name = "Sınıf Düzeyi")]
public string SinifDuzeyi { get; set; } = string.Empty;

        [StringLength(10, ErrorMessage = "Şube en fazla 10 karakter olabilir")]
        [Display(Name = "Şube")]
        public string? Sube { get; set; }

        [StringLength(20, ErrorMessage = "Telefon en fazla 20 karakter olabilir")]
        [Display(Name = "Telefon")]
        public string? Telefon { get; set; }

        [StringLength(20, ErrorMessage = "Veli telefonu en fazla 20 karakter olabilir")]
        [Display(Name = "Veli Telefonu")]
        public string? VeliTelefon { get; set; }

        [StringLength(500, ErrorMessage = "Adres en fazla 500 karakter olabilir")]
        [Display(Name = "Adres")]
        public string? Adres { get; set; }

        [Display(Name = "Oda")]
        public int? OdaId { get; set; }

        [Display(Name = "Aktif")]
        public bool Aktif { get; set; } = true;

        [DataType(DataType.Password)]
        [Display(Name = "Şifre (Portal Girişi İçin)")]
        [StringLength(100, ErrorMessage = "Şifre en fazla 100 karakter olabilir")]
        public string? Sifre { get; set; }
    }

    public class PansiyonOgrenciEditViewModel : PansiyonOgrenciCreateViewModel
    {
        public int Id { get; set; }
        public byte[] RowVersion { get; set; } = Array.Empty<byte>();
    }

    public class PansiyonOgrenciDetailViewModel
    {
        public int Id { get; set; }
        public string OgrenciNo { get; set; } = string.Empty;
        public string AdSoyad { get; set; } = string.Empty;
        public string SinifDuzeyi { get; set; } = string.Empty;
        public string? Sube { get; set; }
        public string? Telefon { get; set; }
        public string? VeliTelefon { get; set; }
        public string? Adres { get; set; }
        public bool Aktif { get; set; }
        public DateTime KayitTarihi { get; set; }
        public int? OdaId { get; set; }
        public string? OdaNo { get; set; }
        public int? OdaKapasite { get; set; }
        public List<PansiyonYoklamaListViewModel> Yoklamalar { get; set; } = new();
        public List<IzinGirisiListViewModel> Izinler { get; set; } = new();
    }

    public class PansiyonOgrenciFilterViewModel
    {
        public string? SearchTerm { get; set; }
        public string? Arama => SearchTerm;
        public string? SinifDuzeyi { get; set; }
        public string? Sube { get; set; }
        public int? OdaId { get; set; }
        public bool? Aktif { get; set; }
        public bool SadeceAktif => Aktif ?? false;
        public int Page { get; set; } = 1;
        public int PageSize { get; set; } = 10;
    }

    public class PansiyonOgrenciExcelImportViewModel
    {
        [Required(ErrorMessage = "Excel dosyası seçiniz")]
        [Display(Name = "Excel Dosyası")]
        public IFormFile ExcelFile { get; set; } = null!;

        [Display(Name = "Oda Seçiniz (Opsiyonel)")]
        public int? OdaId { get; set; }
    }

    public class PansiyonOgrenciExcelRow
    {
        public string OgrenciNo { get; set; } = string.Empty;
        public string AdSoyad { get; set; } = string.Empty;
        public int? SinifDuzeyi { get; set; }
        public string? Sube { get; set; }
        public string? Telefon { get; set; }
        public string? VeliTelefon { get; set; }
        public string? Adres { get; set; }
    }

    // Type aliases for controller compatibility
    public class PansiyonOgrenciViewModel : PansiyonOgrenciDetailViewModel
    {
        public bool YoklamaYapildi { get; set; }
        public byte[] RowVersion { get; set; } = Array.Empty<byte>();
    }

    public class PansiyonOgrenciImportViewModel : PansiyonOgrenciExcelImportViewModel { }
}