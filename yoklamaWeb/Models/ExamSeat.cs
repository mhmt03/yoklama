using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace yoklamaWeb.Models
{
    public class ExamSeat
    {
        [Key]
        public int Id { get; set; }

        // Foreign key to Exam
        [ForeignKey("Exam")]
        public int ExamId { get; set; }
        public Exam Exam { get; set; } = null!;

        // Student identifier (e.g., OgrenciNo)
        [Required]
        public string OgrenciNo { get; set; } = null!;

        [ForeignKey("OgrenciNo")]
        public Ogrenci Ogrenci { get; set; } = null!;

        // Attendance status for the seat
        public AttendanceStatus AttendanceStatus { get; set; } = AttendanceStatus.KontrolEdilmedi;

        // Timestamp for last update (used for polling)
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        // Seat number or location identifier
        [Required]
        public int SeatNumber { get; set; }

        // Salon name where the seat is located
        public string SalonAdi { get; set; } = null!;

        // Row number or order within the salon
        public int Sira { get; set; }

        // Building number or identifier
        public string BinaNo { get; set; } = null!;

        // Student-specific note during exam
        [MaxLength(200)]
        public string? Note { get; set; }
    }
}
