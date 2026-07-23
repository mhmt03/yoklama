using System.ComponentModel.DataAnnotations;
using yoklamaWeb.Models;

namespace yoklamaWeb.ViewModels.Pansiyon
{
    public class OdaListViewModel
    {
        public int Id { get; set; }
        public string OdaNo { get; set; } = string.Empty;
        public int Kapasite { get; set; }
        public int Kat { get; set; }
        public string Cinsiyet { get; set; } = string.Empty;
        public bool Aktif { get; set; }
        public int OgrenciSayisi { get; set; }
        public int BosKapasite => Kapasite - OgrenciSayisi;
        public string DolulukOrani => Kapasite > 0 ? $"%{Math.Round((double)OgrenciSayisi / Kapasite * 100, 1)}" : "%0";
        public List<OdaViewModel> Odalar { get; set; } = new();
        public OdaFilterViewModel Filter { get; set; } = new();
    }

    public class OdaCreateViewModel
    {
        [Required(ErrorMessage = "Oda numarası zorunludur")]
        [StringLength(20, ErrorMessage = "Oda numarası en fazla 20 karakter olabilir")]
        [Display(Name = "Oda No")]
        public string OdaNo { get; set; } = string.Empty;

        [Required(ErrorMessage = "Kapasite zorunludur")]
        [Range(1, 50, ErrorMessage = "Kapasite 1-50 arasında olmalıdır")]
        [Display(Name = "Kapasite")]
        public int Kapasite { get; set; }

        [Required(ErrorMessage = "Kat zorunludur")]
        [Range(0, 10, ErrorMessage = "Kat 0-10 arasında olmalıdır")]
        [Display(Name = "Kat")]
        public int Kat { get; set; }

        [Required(ErrorMessage = "Cinsiyet zorunludur")]
        [StringLength(10, ErrorMessage = "Cinsiyet en fazla 10 karakter olabilir")]
        [Display(Name = "Cinsiyet")]
        public string Cinsiyet { get; set; } = "Kız"; // Kız / Erkek

        [StringLength(500, ErrorMessage = "Açıklama en fazla 500 karakter olabilir")]
        [Display(Name = "Açıklama")]
        public string? Aciklama { get; set; }

        [Display(Name = "Aktif")]
        public bool Aktif { get; set; } = true;
    }

    public class OdaEditViewModel : OdaCreateViewModel
    {
        public int Id { get; set; }
        public byte[] RowVersion { get; set; } = Array.Empty<byte>();
    }

    public class OdaDetailViewModel
    {
        public int Id { get; set; }
        public string OdaNo { get; set; } = string.Empty;
        public int Kapasite { get; set; }
        public int Kat { get; set; }
        public string Cinsiyet { get; set; } = string.Empty;
        public string? Aciklama { get; set; }
        public bool Aktif { get; set; }
        public DateTime OlusturmaTarihi { get; set; }
        public List<PansiyonOgrenciListViewModel> Ogrenciler { get; set; } = new();
        public int OgrenciSayisi => Ogrenciler.Count;
        public int BosKapasite => Kapasite - OgrenciSayisi;
    }

    public class OdaFilterViewModel
    {
        public string? SearchTerm { get; set; }
        public string? Arama => SearchTerm;
        public int? Kat { get; set; }
        public string? Cinsiyet { get; set; }
        public bool SadeceAktif { get; set; }
        public bool? Aktif { get => SadeceAktif; set => SadeceAktif = value ?? false; }
        public yoklamaWeb.Models.Enums.DolulukDurumu? DolulukDurumu { get; set; }
        public int Page { get; set; } = 1;
        public int PageSize { get; set; } = 10;
    }

    public class OdaViewModel
    {
        public int Id { get; set; }
        public string OdaNo { get; set; } = string.Empty;
        public int Kapasite { get; set; }
        public int Kat { get; set; }
        public string Cinsiyet { get; set; } = string.Empty;
        public string? Aciklama { get; set; }
        public bool Aktif { get; set; }
        public int DoluSayisi { get; set; }
        public List<PansiyonOgrenciViewModel> Ogrenciler { get; set; } = new();
        public byte[] RowVersion { get; set; } = Array.Empty<byte>();
    }
}