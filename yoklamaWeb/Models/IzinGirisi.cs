using System;
using System.ComponentModel.DataAnnotations;
using yoklamaWeb.Models.Enums;

namespace yoklamaWeb.Models
{
    public class IzinGirisi
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int OgrenciId { get; set; }
        public PansiyonOgrenci Ogrenci { get; set; }

        [Required]
        public IzinTur Tur { get; set; }

        [Required]
        public DateTime BaslangicTarihi { get; set; }

        [Required]
        public DateTime BitisTarihi { get; set; }

        [Required]
        public int GunSayisi { get; set; }

        [Required]
        public IzinDurum Durum { get; set; } = IzinDurum.Bekliyor;

        private string _aciklama = string.Empty;
        [MaxLength(500)]
        public string Aciklama { get => _aciklama; set => _aciklama = value ?? string.Empty; }

        public int? OnaylayanId { get; set; }
        public PansiyonGorevlisi Onaylayan { get; set; }

        public DateTime? OnayTarihi { get; set; }

        public DateTime OlusturmaTarihi { get; set; } = DateTime.UtcNow;

        public byte[] RowVersion { get; set; }
    }
}