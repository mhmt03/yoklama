using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace yoklamaWeb.Models
{
    public class PansiyonOgrenci
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(20)]
        public string OgrenciNo { get; set; }

        [Required]
        [MaxLength(100)]
        public string AdSoyad { get; set; }

        private string _sinifDuzeyi = string.Empty;
        [MaxLength(20)]
        public string SinifDuzeyi { get => _sinifDuzeyi; set => _sinifDuzeyi = value ?? string.Empty; }

        private string _sube = string.Empty;
        [MaxLength(10)]
        public string Sube { get => _sube; set => _sube = value ?? string.Empty; }

        private string _telefon = string.Empty;
        [MaxLength(11)]
        public string Telefon { get => _telefon; set => _telefon = value ?? string.Empty; }

        private string _veliTelefon = string.Empty;
        [MaxLength(11)]
        public string VeliTelefon { get => _veliTelefon; set => _veliTelefon = value ?? string.Empty; }

        private string _adres = string.Empty;
        [MaxLength(200)]
        public string Adres { get => _adres; set => _adres = value ?? string.Empty; }

        private string _sifre = string.Empty;
        [MaxLength(100)]
        public string Sifre { get => _sifre; set => _sifre = value ?? string.Empty; }

        public DateTime KayitTarihi { get; set; } = DateTime.UtcNow;

        public bool Aktif { get; set; } = true;

        public int? OdaId { get; set; }
        public Oda Oda { get; set; }

        public virtual ICollection<PansiyonYoklama> Yoklamalar { get; set; } = new List<PansiyonYoklama>();
        public virtual ICollection<IzinGirisi> IzinGirisleri { get; set; } = new List<IzinGirisi>();

        public byte[] RowVersion { get; set; }
    }
}