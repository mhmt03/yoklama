using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace yoklamaWeb.Models
{
    public class OptikForm
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(100)]
        public string FormAdi { get; set; } = null!;

        public int AdSoyadBaslangic { get; set; }
        public int AdSoyadUzunluk { get; set; }

        public int NumaraBaslangic { get; set; }
        public int NumaraUzunluk { get; set; }

        public int SinifBaslangic { get; set; }
        public int SinifUzunluk { get; set; }

        public int? KitapcikTuruBaslangic { get; set; }
        public int? KitapcikTuruUzunluk { get; set; }

        public virtual ICollection<OptikFormDers> Dersler { get; set; } = new List<OptikFormDers>();
    }
}
