using System.ComponentModel.DataAnnotations;

namespace yoklamaWeb.Models
{
    public class Yoklamaci
    {
        public int Id { get; set; }

        [Required]
        [MaxLength(50)]
        public string KullaniciAdi { get; set; } = string.Empty;

        [Required]
        [MaxLength(100)]
        public string Sifre { get; set; } = string.Empty;

        [MaxLength(100)]
        public string Ad { get; set; } = string.Empty;

        // Yetki subesi (örnek: "A", "B" vs.)
        [MaxLength(20)]
        public string YetkiSubesi { get; set; } = string.Empty;
    }
}
