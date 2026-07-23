using System;
using System.ComponentModel.DataAnnotations;

namespace yoklamaWeb.Models
{
    public class Sinav
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(200)]
        public string SinavAd { get; set; }

        [Required]
        public DateTime OlusmaTarihi { get; set; }

        [Required]
        public DateTime UygulamaTarihi { get; set; }

        [Required]
        public DateTime GecerlilikTarihi { get; set; }

        public bool AktifMi { get; set; } = true;
    }
}
