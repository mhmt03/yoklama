using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace yoklamaWeb.Models
{
    public class PansiyonGorevlisi
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(50)]
        public string KullaniciAdi { get; set; }

        [Required]
        [MaxLength(100)]
        public string AdSoyad { get; set; }

        [Required]
        [MaxLength(20)]
        public string Rol { get; set; } // "Admin", "Gorevli", "Nobetci"

        private string _telefon = string.Empty;
        [MaxLength(11)]
        public string Telefon { get => _telefon; set => _telefon = value ?? string.Empty; }

        private string _email = string.Empty;
        [MaxLength(100)]
        public string Email { get => _email; set => _email = value ?? string.Empty; }

        public bool Aktif { get; set; } = true;

        public DateTime KayitTarihi { get; set; } = DateTime.UtcNow;

        public DateTime? SonGirisTarihi { get; set; }

        public ICollection<NobetciPlan> NobetciPlanlari { get; set; } = new List<NobetciPlan>();

        public ICollection<PansiyonYoklama> Yoklamalar { get; set; } = new List<PansiyonYoklama>();

        public ICollection<IzinGirisi> IzinGirisleri { get; set; } = new List<IzinGirisi>();

        public byte[] RowVersion { get; set; }
    }
}