using System;
using System.ComponentModel.DataAnnotations;

namespace yoklamaWeb.Models
{
    public class NobetciPlan
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int PansiyonGorevlisiId { get; set; }
        public PansiyonGorevlisi PansiyonGorevlisi { get; set; }

        [Required]
        public DateTime BaslangicTarihi { get; set; }

        [Required]
        public DateTime BitisTarihi { get; set; }

        [Required]
        [MaxLength(20)]
        public string Gun { get; set; } // "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"

        private string _aciklama = string.Empty;
        [MaxLength(200)]
        public string Aciklama { get => _aciklama; set => _aciklama = value ?? string.Empty; }

        public DateTime OlusturmaTarihi { get; set; } = DateTime.UtcNow;

        public int? OlusturanId { get; set; }
        public PansiyonGorevlisi Olusturan { get; set; }

        public byte[] RowVersion { get; set; }
    }
}