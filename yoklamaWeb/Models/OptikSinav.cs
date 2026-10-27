using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace yoklamaWeb.Models
{
    public class OptikSinav
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(200)]
        public string SinavAdi { get; set; } = null!;

        public DateTime UygulamaTarihi { get; set; }

        [MaxLength(500)]
        public string? HedefSiniflar { get; set; } 

        public string? HedefOgrenciler { get; set; }

        public double YanlisDogruyuGotururSayisi { get; set; } = 0;

        [MaxLength(50)]
        public string? KitapcikTurleri { get; set; }

        public virtual ICollection<OptikSinavDers> Dersler { get; set; } = new List<OptikSinavDers>();
        public virtual ICollection<OptikSinavSonuc> Sonuclar { get; set; } = new List<OptikSinavSonuc>();
    }
}
