using System;
using System.Collections.Generic;

namespace yoklamaWeb.Models
{
    public class ClassAttendanceDetailsViewModel
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string BuildingNumber { get; set; } = string.Empty;
        public DateTime ValidFrom { get; set; }
        public DateTime ValidTo { get; set; }
        public TimeSpan? StartTime { get; set; }
        public TimeSpan? EndTime { get; set; }
        public bool OnlyCurrentDayAttendance { get; set; }
        public List<ClassAttendanceStudentRowViewModel> Students { get; set; } = new();
    }

    public class ClassAttendanceStudentRowViewModel
    {
        public int Id { get; set; }
        public string OgrenciNo { get; set; } = string.Empty;
        public string AdSoyad { get; set; } = string.Empty;
        public string SinifDuzeyi { get; set; } = string.Empty;
        public string Sube { get; set; } = string.Empty;
        public string? Salon { get; set; }
        public string? Sira { get; set; }
    }
}
