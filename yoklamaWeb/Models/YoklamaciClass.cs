using System.ComponentModel.DataAnnotations;

namespace yoklamaWeb.Models
{
    public class YoklamaciClass
    {
        [Key]
        public int Id { get; set; }

        // FK to IdentityUser (Yoklamaci)
        [Required]
        public string YoklamaciId { get; set; } = null!;

        [Required]
        [MaxLength(20)]
        public string SinifDuzeyi { get; set; } = null!;
    }
}
