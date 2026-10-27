using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace yoklamaWeb.Models
{
    public class GunlukYoklamaciProgram
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int GunlukYoklamaciId { get; set; }

        [ForeignKey(nameof(GunlukYoklamaciId))]
        public virtual GunlukYoklamaci? GunlukYoklamaci { get; set; }

        [Required]
        [MaxLength(20)]
        public string Gun { get; set; } = null!; // "Pazartesi", "Salı", etc.

        [Required]
        public int OturumNo { get; set; } // 1, 2, 3, etc.

        [Required]
        [MaxLength(50)]
        public string Salon { get; set; } = null!; // Salon/Sınıf name
    }
}
