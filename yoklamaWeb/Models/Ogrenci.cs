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

        [Required]
        [Display(Name = "Sınavlara Katılacak Mı")]
        public bool SinavlaraKatilacak { get; set; } = true;

        [MaxLength(20)]
        [Display(Name = "Alanı")]
        public string Alan { get; set; } = "YOK";
    }
}
