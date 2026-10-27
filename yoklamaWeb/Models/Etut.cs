using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace yoklamaWeb.Models
{
    public class Etut
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(50)]
        [Display(Name = "Etüt Adı / Salonu")]
        public string EtutAdi { get; set; }

        [Required]
        [Range(1, 1000, ErrorMessage = "Kapasite 1 ile 1000 arasında olmalıdır.")]
        public int Kapasite { get; set; }

        private string _aciklama = string.Empty;
        [MaxLength(200)]
        [Display(Name = "Açıklama")]
        public string Aciklama { get => _aciklama; set => _aciklama = value ?? string.Empty; }

        public bool Aktif { get; set; } = true;

        public DateTime OlusturmaTarihi { get; set; } = DateTime.UtcNow;

        public ICollection<PansiyonOgrenci> Ogrenciler { get; set; } = new List<PansiyonOgrenci>();

        public byte[]? RowVersion { get; set; }
    }
}
