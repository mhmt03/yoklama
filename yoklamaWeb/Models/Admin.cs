using System.ComponentModel.DataAnnotations;

namespace yoklamaWeb.Models
{
    public class Admin
    {
        [Key]
        public int Id { get; set; }

        [Required, MaxLength(50)]
        public string KullaniciAdi { get; set; }

        [Required]
        public string Sifre { get; set; }

        [MaxLength(100)]
        public string Ad { get; set; }
    }
}
