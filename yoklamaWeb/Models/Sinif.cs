using System.ComponentModel.DataAnnotations;

namespace yoklamaWeb.Models
{
    public class Sinif
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(100)]
        public string Name { get; set; } = null!;

        public int StudentCount { get; set; }
    }
}
