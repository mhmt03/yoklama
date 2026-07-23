using System.ComponentModel.DataAnnotations;
using yoklamaWeb.Models;

namespace yoklamaWeb.ViewModels.Pansiyon
{
    public class NobetciPlanViewModel
    {
        public int Id { get; set; }
        public int PansiyonGorevlisiId { get; set; }
        public string GorevliAdSoyad { get; set; } = string.Empty;
        public string GorevlisiAdSoyad { get => GorevliAdSoyad; set => GorevliAdSoyad = value; }
        public DateTime BaslangicTarihi { get; set; }
        public DateTime BitisTarihi { get; set; }
        public string Gun { get; set; } = string.Empty;
        public string? Aciklama { get; set; }
        public DateTime OlusturmaTarihi { get; set; }
        public int? OlusturanId { get; set; }
        public string OlusturanAdSoyad { get; set; } = string.Empty;
        public bool Aktif => DateTime.Now >= BaslangicTarihi && DateTime.Now <= BitisTarihi;
        public byte[] RowVersion { get; set; } = Array.Empty<byte>();
    }

    public class NobetciPlanListViewModel
    {
        public List<NobetciPlanViewModel> Planlar { get; set; } = new();
        public NobetciPlanFilterViewModel Filter { get; set; } = new();
    }

    public class NobetciPlanCreateViewModel
    {
        [Required(ErrorMessage = "Görevli seçiniz")]
        [Display(Name = "Görevli")]
        public int PansiyonGorevlisiId { get; set; }

        [Required(ErrorMessage = "Başlangıç tarihi zorunludur")]
        [Display(Name = "Başlangıç Tarihi")]
        [DataType(DataType.Date)]
        public DateTime BaslangicTarihi { get; set; } = DateTime.Today;

        [Required(ErrorMessage = "Bitiş tarihi zorunludur")]
        [Display(Name = "Bitiş Tarihi")]
        [DataType(DataType.Date)]
        public DateTime BitisTarihi { get; set; } = DateTime.Today.AddDays(7);

        [Required(ErrorMessage = "Gün seçiniz")]
        [StringLength(20, ErrorMessage = "Gün en fazla 20 karakter olabilir")]
        [Display(Name = "Gün")]
        public string Gun { get; set; } = "Pazartesi"; // Pazartesi, Salı, Çarşamba, Perşembe, Cuma, Cumartesi, Pazar

        [StringLength(500, ErrorMessage = "Açıklama en fazla 500 karakter olabilir")]
        [Display(Name = "Açıklama")]
        public string? Aciklama { get; set; }
    }

    public class NobetciPlanEditViewModel : NobetciPlanCreateViewModel
    {
        public int Id { get; set; }
        public byte[] RowVersion { get; set; } = Array.Empty<byte>();
    }

    public class NobetciPlanDetailViewModel
    {
        public int Id { get; set; }
        public int PansiyonGorevlisiId { get; set; }
        public string GorevliAdSoyad { get; set; } = string.Empty;
        public string GorevliRol { get; set; } = string.Empty;
        public DateTime BaslangicTarihi { get; set; }
        public DateTime BitisTarihi { get; set; }
        public string Gun { get; set; } = string.Empty;
        public string? Aciklama { get; set; }
        public DateTime OlusturmaTarihi { get; set; }
        public int OlusturanId { get; set; }
        public string OlusturanAdSoyad { get; set; } = string.Empty;
        public bool Aktif => DateTime.Now >= BaslangicTarihi && DateTime.Now <= BitisTarihi;
    }

    public class NobetciPlanFilterViewModel
    {
        public string? Arama { get; set; }
        public int? GorevlisiId { get; set; }
        public int? PansiyonGorevlisiId { get => GorevlisiId; set => GorevlisiId = value; }
        public string? Gun { get; set; }
        public DateTime? BaslangicTarihi { get; set; }
        public DateTime? BitisTarihi { get; set; }
        public bool SadeceAktif { get; set; }
        public int Page { get; set; } = 1;
        public int PageSize { get; set; } = 10;
    }
}