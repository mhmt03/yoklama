using System;
using System.ComponentModel.DataAnnotations;

namespace yoklamaWeb.Models
{
    public class SystemLog
    {
        [Key]
        public int Id { get; set; }

        [Required, MaxLength(100)]
        public string KullaniciAdi { get; set; }

        [MaxLength(100)]
        public string Rol { get; set; }

        [Required, MaxLength(100)]
        public string ControllerName { get; set; }

        [Required, MaxLength(100)]
        public string ActionName { get; set; }

        [MaxLength(10)]
        public string Metot { get; set; }

        public string Parametreler { get; set; }

        [Required, MaxLength(45)]
        public string IpAdresi { get; set; }

        [Required]
        public DateTime Tarih { get; set; }
    }
}
