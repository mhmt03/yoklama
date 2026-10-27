using System.Collections.Generic;
using System.Linq;

namespace yoklamaWeb.Models
{
    public class AdminExamDetailsViewModel
    {
        public int ExamId { get; set; }
        public string ExamName { get; set; } = string.Empty;
        public DateTime ApplicationDate { get; set; }
        public string BuildingNumber { get; set; } = string.Empty;
        public DateTime ValidFrom { get; set; }
        public DateTime ValidTo { get; set; }
        public TimeSpan? StartTime { get; set; }
        public TimeSpan? EndTime { get; set; }

        public int YoklamaSayisi { get; set; } = 1;
        public int SelectedYoklamaNo { get; set; } = 1;

        public List<AdminSeatRowViewModel> Seats { get; set; } = new();

        public int TotalStudents => Seats.Count;
        public int PresentCount => Seats.Count(s => s.AttendanceStatus == AttendanceStatus.Katildi);
        public int AbsentCount => Seats.Count(s => s.AttendanceStatus == AttendanceStatus.Katilmadi);
        public int LateCount => Seats.Count(s => s.AttendanceStatus == AttendanceStatus.Gec);
        public int PendingCount => Seats.Count(s => s.AttendanceStatus == AttendanceStatus.KontrolEdilmedi);
    }

    public class AdminSeatRowViewModel
    {
        public int SeatId { get; set; }
        public string OgrenciNo { get; set; } = string.Empty;
        public string AdSoyad { get; set; } = string.Empty;
        public string SinifDuzeyi { get; set; } = string.Empty;
        public string Sube { get; set; } = string.Empty;
        public int SeatNumber { get; set; }
        public string SalonAdi { get; set; } = string.Empty;
        public int Sira { get; set; }
        public string BinaNo { get; set; } = string.Empty;
        public AttendanceStatus AttendanceStatus { get; set; }
        public int YoklamaNo { get; set; } = 1;
        public string Note { get; set; } = string.Empty;
        public string ProctorName { get; set; } = string.Empty;
        public string RoomNote { get; set; } = string.Empty;
        public DateTime UpdatedAt { get; set; }
    }

    public class AdminExamItemViewModel
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public DateTime ApplicationDate { get; set; }
        public string BuildingNumber { get; set; } = string.Empty;
        public DateTime ValidFrom { get; set; }
        public DateTime ValidTo { get; set; }
        public TimeSpan? StartTime { get; set; }
        public TimeSpan? EndTime { get; set; }
        public int YoklamaSayisi { get; set; }

        public int TotalStudents { get; set; }
        public int PresentCount { get; set; }
        public int AbsentCount { get; set; }
        public int LateCount { get; set; }
        public int PendingCount { get; set; }
    }
}
