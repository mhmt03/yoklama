using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace yoklamaWeb.Models
{
    public class OptikFormDers
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int OptikFormId { get; set; }

        [ForeignKey("OptikFormId")]
        public virtual OptikForm OptikForm { get; set; } = null!;

        [Required]
        [MaxLength(50)]
        public string DersAdi { get; set; } = null!;

        public int BaslangicSutun { get; set; }
        public int KarakterSayisi { get; set; }
    }
}
