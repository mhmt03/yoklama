using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace yoklamaWeb.Models
{


    public class Attendance
    {
        [Key]
        public int Id { get; set; }

        // Foreign keys
        [ForeignKey("Exam")]
        public int ExamId { get; set; }
        public Exam Exam { get; set; } = null!;

        [ForeignKey("Student")]
        public string StudentNumber { get; set; } = null!; // OgrenciNo
        public Ogrenci Student { get; set; } = null!;

        // Classroom and seat info
        [Required]
        public string Room { get; set; } = "salonsuz"; // default if missing

        // Seat number, default large number if missing
        public int SeatNumber { get; set; } = 1000;

        // Attendance status
        public AttendanceStatus Status { get; set; } = AttendanceStatus.KontrolEdilmedi;

        // Who recorded the attendance (User Id)
        public string? RecordedByUserId { get; set; }

        public string? Note { get; set; }

        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }
}
