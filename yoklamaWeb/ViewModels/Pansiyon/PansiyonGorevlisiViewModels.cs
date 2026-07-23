using System.ComponentModel.DataAnnotations;
using yoklamaWeb.Models;

namespace yoklamaWeb.ViewModels.Pansiyon
{
    // Tekil görevli kaydını temsil eder (liste satırı, silme onayı vb. için)
    public class PansiyonGorevlisiViewModel
    {
        public int Id { get; set; }
        public string KullaniciAdi { get; set; } = string.Empty;
        public string AdSoyad { get; set; } = string.Empty;
        public string Rol { get; set; } = string.Empty;
        public string? Telefon { get; set; }
        public string? Email { get; set; }
        public bool Aktif { get; set; }
        public DateTime KayitTarihi { get; set; }
        public DateTime? SonGirisTarihi { get; set; }
        public byte[] RowVersion { get; set; } = Array.Empty<byte>();
    }

    // Index sayfası için sarmalayıcı (liste + filtre)
    public class PansiyonGorevlisiListViewModel
    {
        public List<PansiyonGorevlisiViewModel> Gorevlisiler { get; set; } = new();
        public PansiyonGorevlisiFilterViewModel Filter { get; set; } = new();
    }

    public class PansiyonGorevlisiCreateViewModel
    {
        [Required(ErrorMessage = "Kullanıcı adı zorunludur")]
        [StringLength(50, ErrorMessage = "Kullanıcı adı en fazla 50 karakter olabilir")]
        [Display(Name = "Kullanıcı Adı")]
        public string KullaniciAdi { get; set; } = string.Empty;

        [Required(ErrorMessage = "Şifre zorunludur")]
        [DataType(DataType.Password)]
        [StringLength(100, MinimumLength = 4, ErrorMessage = "Şifre en az 4 karakter olmalıdır")]
        [Display(Name = "Şifre")]
        public string Sifre { get; set; } = string.Empty;

        [Required(ErrorMessage = "Ad Soyad zorunludur")]
        [StringLength(100, ErrorMessage = "Ad Soyad en fazla 100 karakter olabilir")]
        [Display(Name = "Ad Soyad")]
        public string AdSoyad { get; set; } = string.Empty;

        [Required(ErrorMessage = "Rol zorunludur")]
        [StringLength(20, ErrorMessage = "Rol en fazla 20 karakter olabilir")]
        [Display(Name = "Rol")]
        public string Rol { get; set; } = "Görevli"; // Görevli / Müdür / Yardımcı

        [StringLength(20, ErrorMessage = "Telefon en fazla 20 karakter olabilir")]
        [Display(Name = "Telefon")]
        public string? Telefon { get; set; }

        [EmailAddress(ErrorMessage = "Geçerli bir e-posta adresi giriniz")]
        [StringLength(100, ErrorMessage = "E-posta en fazla 100 karakter olabilir")]
        [Display(Name = "E-posta")]
        public string? Email { get; set; }

        [Display(Name = "Aktif")]
        public bool Aktif { get; set; } = true;
    }

    public class PansiyonGorevlisiEditViewModel : PansiyonGorevlisiCreateViewModel
    {
        public int Id { get; set; }
        public byte[] RowVersion { get; set; } = Array.Empty<byte>();
    }

    public class PansiyonGorevlisiDetailViewModel
    {
        public int Id { get; set; }
        public string KullaniciAdi { get; set; } = string.Empty;

        [DataType(DataType.Password)]
        [StringLength(100, MinimumLength = 4, ErrorMessage = "Şifre en az 4 karakter olmalıdır")]
        [Display(Name = "Yeni Şifre (Boş bırakılırsa değişmez)")]
        public string? Sifre { get; set; }

        public string AdSoyad { get; set; } = string.Empty;
        public string Rol { get; set; } = string.Empty;
        public string? Telefon { get; set; }
        public string? Email { get; set; }
        public bool Aktif { get; set; }
        public DateTime KayitTarihi { get; set; }
        public DateTime? SonGirisTarihi { get; set; }
        public byte[] RowVersion { get; set; } = Array.Empty<byte>();
        public List<NobetciPlanViewModel> NobetciPlanlari { get; set; } = new();
        public List<PansiyonYoklamaListViewModel> YapilanYoklamalar { get; set; } = new();
        public List<IzinGirisiListViewModel> KaydedilenIzinler { get; set; } = new();
    }

    public class PansiyonGorevlisiFilterViewModel
    {
        public string? SearchTerm { get; set; }
        public string? Arama => SearchTerm;
        public string? Rol { get; set; }
        public bool? Aktif { get; set; }
        public bool SadeceAktif => Aktif ?? false;
        public int Page { get; set; } = 1;
        public int PageSize { get; set; } = 10;
    }
}