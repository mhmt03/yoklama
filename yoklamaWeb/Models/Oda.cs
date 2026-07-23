using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace yoklamaWeb.Models
{
    public class Oda
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(20)]
        public string OdaNo { get; set; }

        [Required]
        public int Kapasite { get; set; }

        [Required]
        public int Kat { get; set; }

        [Required]
        [MaxLength(10)]
        public string Cinsiyet { get; set; } // "Kiz", "Erkek", "Karışık"

        private string _aciklama = string.Empty;
        [MaxLength(200)]
        public string Aciklama { get => _aciklama; set => _aciklama = value ?? string.Empty; }

        public bool Aktif { get; set; } = true;

        public DateTime OlusturmaTarihi { get; set; } = DateTime.UtcNow;

        public ICollection<PansiyonOgrenci> Ogrenciler { get; set; } = new List<PansiyonOgrenci>();

        public byte[] RowVersion { get; set; }
    }
}