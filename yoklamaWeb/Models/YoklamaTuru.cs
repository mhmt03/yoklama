using System;
using System.ComponentModel.DataAnnotations;

namespace yoklamaWeb.Models
{
    public class YoklamaTuru
    {
        [Key]
        public int Id { get; set; }

        [Required(ErrorMessage = "Yoklama adı zorunludur.")]
        [MaxLength(100)]
        [Display(Name = "Yoklama Adı")]
        public string Ad { get; set; }

        [Required(ErrorMessage = "Sıralama zorunludur.")]
        [Display(Name = "Sıra")]
        public int Sira { get; set; } = 1;

        public bool Aktif { get; set; } = true;

        [Display(Name = "Oluşturma Tarihi")]
        public DateTime OlusturmaTarihi { get; set; } = DateTime.UtcNow;

        public byte[]? RowVersion { get; set; }
    }
}
