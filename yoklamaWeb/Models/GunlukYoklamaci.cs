using System.ComponentModel.DataAnnotations;

namespace yoklamaWeb.Models
{
    public class GunlukYoklamaci
    {
        [Key]
        public int Id { get; set; }

        [Required(ErrorMessage = "Ad Soyad gereklidir.")]
        [MaxLength(100)]
        public string AdSoyad { get; set; } = null!;

        [Required(ErrorMessage = "Kullanıcı Adı gereklidir.")]
        [MaxLength(50)]
        public string KullaniciAdi { get; set; } = null!;

        [Required(ErrorMessage = "Şifre gereklidir.")]
        [MaxLength(100)]
        public string Sifre { get; set; } = null!;

        [Required(ErrorMessage = "Branş gereklidir.")]
        [MaxLength(100)]
        public string Brans { get; set; } = null!;
    }
}
