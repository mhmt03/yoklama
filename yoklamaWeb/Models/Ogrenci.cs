using System.ComponentModel.DataAnnotations;

namespace yoklamaWeb.Models
{
    public class Ogrenci
    {
        [Key]
        [MaxLength(20)]
        public string OgrenciNo { get; set; } = null!;

        [Required]
        [MaxLength(100)]
        public string AdSoyad { get; set; } = null!;

        [Required]
        [MaxLength(20)]
        public string SinifDuzeyi { get; set; } = null!;

        [Required]
        [MaxLength(20)]
        public string Sube { get; set; } = null!;
    }
}
