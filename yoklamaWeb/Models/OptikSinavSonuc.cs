using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace yoklamaWeb.Models
{
    public class OptikSinavSonuc
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int OptikSinavId { get; set; }

        [ForeignKey("OptikSinavId")]
        public virtual OptikSinav OptikSinav { get; set; } = null!;

        [Required]
        [MaxLength(20)]
        public string OgrenciNo { get; set; } = null!;

        [ForeignKey("OgrenciNo")]
        public virtual Ogrenci Ogrenci { get; set; } = null!;

        [MaxLength(5)]
        public string? KitapcikTuru { get; set; }

        public int ToplamDogru { get; set; }
        public int ToplamYanlis { get; set; }
        public int ToplamBos { get; set; }
        public double ToplamNet { get; set; }
        
        [MaxLength(200)]
        public string? OrijinalSatir { get; set; } 

        public virtual ICollection<OptikSinavSonucDers> DersSonuclari { get; set; } = new List<OptikSinavSonucDers>();
    }
}
