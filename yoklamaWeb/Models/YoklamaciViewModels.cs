using System;
using System.Collections.Generic;

namespace yoklamaWeb.Models
{
    /// <summary>
    /// Yoklamacı paneli — sınav listesi öğesi
    /// </summary>
    public class YoklamaciExamItemViewModel
    {
        public int ExamId { get; set; }
        public string ExamName { get; set; } = string.Empty;
        public DateTime ApplicationDate { get; set; }
        public string Room { get; set; } = string.Empty;
        public DateTime ValidFrom { get; set; }
        public DateTime ValidTo { get; set; }
        public TimeSpan? StartTime { get; set; }
        public TimeSpan? EndTime { get; set; }
        /// <summary>Sınav tarihi ve saati geçmemişse true</summary>
        public bool IsAccessible { get; set; }
    }

    /// <summary>
    /// Yoklama alma sayfası — tek öğrenci satırı
    /// </summary>
    public class AttendanceSeatRow
    {
        public int SeatId { get; set; }
        public string OgrenciNo { get; set; } = string.Empty;
        public string AdSoyad { get; set; } = string.Empty;
        public string SinifDuzeyi { get; set; } = string.Empty;
        public string Sube { get; set; } = string.Empty;
        public int SeatNumber { get; set; }
        public int Sira { get; set; }
        public AttendanceStatus Status { get; set; } = AttendanceStatus.KontrolEdilmedi;
        public string Not { get; set; } = string.Empty;
    }

    /// <summary>
    /// Yoklama alma sayfası — tüm sayfa verisi (GET)
    /// </summary>
    public class TakeAttendanceViewModel
    {
        public int ExamId { get; set; }
        public string ExamName { get; set; } = string.Empty;
        public DateTime ApplicationDate { get; set; }
        public string Room { get; set; } = string.Empty;
        public List<AttendanceSeatRow> Seats { get; set; } = new();
        // Filtreleme / sıralama
        public string SortBy { get; set; } = "Sira";
        public string FilterStatus { get; set; } = "Tumu";
        public bool IsTimeValid { get; set; }
        public string? ProctorName { get; set; }
        public string? ExamNote { get; set; }
    }

    /// <summary>
    /// Yoklama kaydetme — POST formu
    /// </summary>
    public class SaveAttendanceViewModel
    {
        public int ExamId { get; set; }
        public string Room { get; set; } = string.Empty;
        public string YoklamaciIsmi { get; set; } = string.Empty;
        public string SinavNotu { get; set; } = string.Empty;
        public List<AttendanceSeatRow> Seats { get; set; } = new();
    }
}
