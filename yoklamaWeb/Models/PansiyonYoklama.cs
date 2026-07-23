using System;
using System.ComponentModel.DataAnnotations;

namespace yoklamaWeb.Models
{
    public class PansiyonYoklama
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int PansiyonOgrenciId { get; set; }
        public PansiyonOgrenci PansiyonOgrenci { get; set; }

        [Required]
        public DateTime Tarih { get; set; }

        public TimeSpan? Saat { get; set; }

        [Required]
        [MaxLength(20)]
        public string Durum { get; set; } // "Var", "Yok", "Izinli", "Gecikmeli"

        private string _aciklama = string.Empty;
        [MaxLength(500)]
        public string Aciklama { get => _aciklama; set => _aciklama = value ?? string.Empty; }

        [Required]
        public int YoklamaYapanId { get; set; }
        public PansiyonGorevlisi YoklamaYapan { get; set; }

        public DateTime KayitZamani { get; set; } = DateTime.UtcNow;

        public byte[] RowVersion { get; set; }
    }
}