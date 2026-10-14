using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OgretmenAjanda.Api.Models
{
    public static class UserRoles
    {
        public const string SuperAdmin = "SUPERADMIN";
        public const string SchoolAdmin = "SCHOOL_ADMIN";
        public const string Staff = "STAFF";
        public const string Teacher = "TEACHER";
        public const string Student = "STUDENT";
    }

    public class School
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required, MaxLength(150)]
        public string Name { get; set; } = string.Empty;

        [Required, MaxLength(20)]
        public string Code { get; set; } = string.Empty; // Benzersiz Okul Kodu örn: KML-2026-X8

        [MaxLength(250)]
        public string? Address { get; set; }

        [MaxLength(20)]
        public string? Phone { get; set; }

        public Guid? AdminUserId { get; set; }

        [MaxLength(50)]
        public string? CustomerId { get; set; } // Hangi müşteriye/admine ait olduğu (örn: MST-10001)

        [MaxLength(50)]
        public string? RelationId { get; set; } // İlişki ID (örn: ILK-10001)

        [MaxLength(200)]
        public string? GeminiApiKey { get; set; } // Okulun kurumsal ortak Gemini API Anahtarı

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? LicenseExpiresAt { get; set; } // Okul lisansı son kullanma tarihi
        public bool IsActive { get; set; } = true;
    }

    public class User
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required, MaxLength(100)]
        public string Username { get; set; } = string.Empty; // Süper admin için 'mehmet', öğrenci için öğrenci no

        [Required]
        public string PasswordHash { get; set; } = string.Empty;

        [Required, MaxLength(120)]
        public string FullName { get; set; } = string.Empty;

        [MaxLength(150)]
        public string? Email { get; set; }

        [MaxLength(30)]
        public string? Phone { get; set; }

        [Required, MaxLength(30)]
        public string Role { get; set; } = UserRoles.Teacher;

        public Guid? SchoolId { get; set; }

        [MaxLength(50)]
        public string? CustomerId { get; set; } // Müşteri No (Admin/Müşteri için, örn: MST-10001)

        [MaxLength(50)]
        public string? RelationId { get; set; } // İlişki ID (Admin ve bağlı öğretmen/öğrenci için, örn: ILK-10001)

        // Bireysel öğretmen veya okul lisansı için geçerlilik
        public DateTime? LicenseExpiresAt { get; set; }
        public bool IsActive { get; set; } = true;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? LastLoginAt { get; set; }

        // Öğretmenin sorumlu olduğu sınıflar/şubeler (JSON formatında saklanabilir)
        public string? AssignedClassesJson { get; set; }

        [MaxLength(300)]
        public string? PushToken { get; set; } // Expo Push Token (Kilitli ekran bildirimi için)
    }

    public class Student
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        public Guid SchoolId { get; set; }

        [MaxLength(50)]
        public string? RelationId { get; set; } // İlişki ID (Bağlı olduğu okulun ve müşterinin ilişki ID'si)

        [Required, MaxLength(30)]
        public string StudentNumber { get; set; } = string.Empty;

        [Required, MaxLength(120)]
        public string FullName { get; set; } = string.Empty;

        [Required, MaxLength(20)]
        public string Grade { get; set; } = string.Empty; // 9, 10, 11, 12 veya 1, 2, 3...

        [Required, MaxLength(20)]
        public string Section { get; set; } = string.Empty; // A, B, C...

        [MaxLength(300)]
        public string? PhotoPath { get; set; } // Sunucudaki göreli dosya yolu (/uploads/...)

        [MaxLength(100)]
        public string? ParentName { get; set; }

        [MaxLength(30)]
        public string? ParentPhone { get; set; }

        [MaxLength(30)]
        public string? StudentPhone { get; set; }

        public string? Notes { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    public class Assignment
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        public Guid SchoolId { get; set; }
        public Guid TeacherId { get; set; }

        [MaxLength(120)]
        public string TeacherName { get; set; } = string.Empty;

        [Required, MaxLength(100)]
        public string LessonName { get; set; } = string.Empty;

        [Required, MaxLength(200)]
        public string Title { get; set; } = string.Empty;

        public string? Description { get; set; }

        public DateTime DueDate { get; set; }

        [MaxLength(30)]
        public string TargetGrade { get; set; } = string.Empty;

        [MaxLength(30)]
        public string TargetSection { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    public class AssignmentSubmission
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        public Guid AssignmentId { get; set; }
        public Guid StudentId { get; set; }

        // DONE (Yapıldı), MISSING (Eksik), NOT_DONE (Yapılmadı), EXEMPT (Muaf)
        [MaxLength(20)]
        public string Status { get; set; } = "NOT_DONE";

        public string? Feedback { get; set; }
        public DateTime CheckedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    public class StudentEvaluation
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        public Guid SchoolId { get; set; }
        public Guid TeacherId { get; set; }

        [MaxLength(120)]
        public string TeacherName { get; set; } = string.Empty;

        public Guid StudentId { get; set; }

        // NOTE (Görüş), OBSERVATION (Gözlem), QUIZ (Quiz/Not)
        [MaxLength(30)]
        public string Type { get; set; } = "NOTE";

        [MaxLength(150)]
        public string? Title { get; set; }

        [Required]
        public string Content { get; set; } = string.Empty;

        public double? Score { get; set; } // Quiz veya sınav notu ise

        public bool IsSharedWithParent { get; set; } = false; // Veliye gönderildi mi?

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    public class ScheduleItem
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        public Guid SchoolId { get; set; }
        public Guid? TeacherId { get; set; }

        [MaxLength(120)]
        public string? TeacherName { get; set; }

        public int DayOfWeek { get; set; } // 1: Pazartesi, 5: Cuma...
        public int LessonHour { get; set; } // 1. ders, 2. ders...

        [MaxLength(30)]
        public string Grade { get; set; } = string.Empty;

        [MaxLength(30)]
        public string Section { get; set; } = string.Empty;

        [MaxLength(100)]
        public string LessonName { get; set; } = string.Empty;

        [MaxLength(50)]
        public string? Classroom { get; set; }
    }

    public class YearlyPlanItem
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        public Guid SchoolId { get; set; }

        [MaxLength(100)]
        public string LessonName { get; set; } = string.Empty;

        [MaxLength(30)]
        public string Grade { get; set; } = string.Empty;

        public int WeekNumber { get; set; }

        public DateTime? StartDate { get; set; }
        public DateTime? EndDate { get; set; }

        [MaxLength(300)]
        public string Subject { get; set; } = string.Empty; // Ders Defterine yazılacak konu

        public string LearningOutcomes { get; set; } = string.Empty; // Kazanımlar
    }

    public class AppMessage
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        public Guid SchoolId { get; set; }

        public Guid SenderId { get; set; }

        [MaxLength(120)]
        public string SenderName { get; set; } = string.Empty;

        [MaxLength(30)]
        public string SenderRole { get; set; } = string.Empty;

        public Guid? ReceiverId { get; set; } // Bireysel ise

        [MaxLength(30)]
        public string? TargetGrade { get; set; } // Sınıf geneliyse (örn: 10)

        [MaxLength(30)]
        public string? TargetSection { get; set; } // Şube geneliyse (örn: A)

        [MaxLength(30)]
        public string? TargetRole { get; set; } // "TEACHER", "STUDENT", "ALL"

        [Required]
        public string Content { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public bool IsRead { get; set; } = false;
    }

    public class AuditLog
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        public Guid? SchoolId { get; set; }
        public Guid UserId { get; set; }

        [MaxLength(30)]
        public string UserRole { get; set; } = string.Empty;

        [Required, MaxLength(50)]
        public string ActionType { get; set; } = string.Empty; // CREATE, UPDATE, DELETE, SEND_NOTIFICATION...

        [Required, MaxLength(50)]
        public string EntityName { get; set; } = string.Empty; // Assignment, Evaluation, Student...

        [MaxLength(50)]
        public string? EntityId { get; set; }

        public string? DetailsJson { get; set; } // Eski ve yeni değerler

        public DateTime Timestamp { get; set; } = DateTime.UtcNow;

        [MaxLength(60)]
        public string? IpAddress { get; set; }
    }

    public class SchoolClass
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        public Guid SchoolId { get; set; }

        [Required, MaxLength(30)]
        public string Grade { get; set; } = string.Empty; // 9, 10, 11, 12, 1, 2...

        [Required, MaxLength(30)]
        public string Section { get; set; } = string.Empty; // A, B, C, Fen, Say...

        [MaxLength(50)]
        public string? AcademicYear { get; set; } // 2026-2027

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    public class SchoolLesson
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        public Guid SchoolId { get; set; }

        [Required, MaxLength(100)]
        public string Name { get; set; } = string.Empty; // Fizik, Kimya, Biyoloji, Matematik...

        [MaxLength(30)]
        public string? ShortCode { get; set; } // FZK, MAT, KMY...

        [MaxLength(30)]
        public string? Grade { get; set; } // 9, 10 veya Tüm Kademeler

        public int WeeklyHours { get; set; } = 2;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
