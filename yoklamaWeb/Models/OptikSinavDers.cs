using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace yoklamaWeb.Models
{
    public class OptikSinavDers
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int OptikSinavId { get; set; }

        [ForeignKey("OptikSinavId")]
        public virtual OptikSinav OptikSinav { get; set; } = null!;

        [Required]
        [MaxLength(50)]
        public string DersAdi { get; set; } = null!;

        public int SoruSayisi { get; set; }

        [Required]
        [MaxLength(200)]
        public string CevapAnahtari { get; set; } = null!;

        [MaxLength(200)]
        public string? CevapAnahtariB { get; set; }

        [MaxLength(200)]
        public string? CevapAnahtariC { get; set; }

        [MaxLength(200)]
        public string? CevapAnahtariD { get; set; }
    }
}
