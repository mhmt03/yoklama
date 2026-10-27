using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace yoklamaWeb.Models
{
    public class OptikSinavSonucDers
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int OptikSinavSonucId { get; set; }

        [ForeignKey("OptikSinavSonucId")]
        public virtual OptikSinavSonuc OptikSinavSonuc { get; set; } = null!;

        [Required]
        [MaxLength(50)]
        public string DersAdi { get; set; } = null!;

        public int Dogru { get; set; }
        public int Yanlis { get; set; }
        public int Bos { get; set; }
        public double Net { get; set; }
    }
}
