using System;
using System.Collections.Generic;

namespace OgretmenAjanda.Api.DTOs
{
    public class LoginRequest
    {
        public string Username { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public string? SchoolCode { get; set; }
        public string? InstitutionCode { get; set; } // Benzersiz Kurum Adı veya Kodu (örn: zafer-egitim)
    }

    public class InstitutionDto
    {
        public Guid Id { get; set; }
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public int MaxSchoolCount { get; set; }
        public int CurrentSchoolCount { get; set; }
        public string? ContactName { get; set; }
        public string? ContactPhone { get; set; }
        public string? ContactEmail { get; set; }
        public DateTime? LicenseExpiresAt { get; set; }
        public bool IsActive { get; set; }
        public List<string> SchoolNames { get; set; } = new();
        public Guid? AdminUserId { get; set; }
        public string? AdminUsername { get; set; }
        public string? AdminFullName { get; set; }
        public string? AdminPassword { get; set; }
        public int TotalTeachers { get; set; }
        public int TotalStudents { get; set; }
    }

    public class StudentLoginRequest
    {
        public string SchoolCode { get; set; } = string.Empty;
        public string StudentNumber { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty; // Varsayılan aaaa_ogrencino
    }

    public class TeacherRegisterRequest
    {
        public string SchoolCode { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public string? Email { get; set; }
        public string? Phone { get; set; }
        public string? Branch { get; set; } // Branşı örn: Fizik
    }

    public class ChangePasswordRequest
    {
        public string OldPassword { get; set; } = string.Empty;
        public string NewPassword { get; set; } = string.Empty;
    }

    public class UpdateCredentialsRequest
    {
        public string? NewUsername { get; set; }
        public string? OldPassword { get; set; }
        public string? NewPassword { get; set; }
    }

    public class LoginResponse
    {
        public string Token { get; set; } = string.Empty;
        public Guid UserId { get; set; }
        public string Username { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
        public Guid? SchoolId { get; set; }
        public string? SchoolCode { get; set; }
        public string? SchoolName { get; set; }
        public string? CustomerId { get; set; } // Müşteri No
        public string? RelationId { get; set; } // İlişki ID
        public string? GeminiApiKey { get; set; }
        public DateTime? LicenseExpiresAt { get; set; }
        public List<SchoolDto> AffiliatedSchools { get; set; } = new();
    }

    public class SchoolDto
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Code { get; set; } = string.Empty;
        public string? Address { get; set; }
        public string? Phone { get; set; }
        public string? GeminiApiKey { get; set; }
        public string? GeminiModel { get; set; }
        public int DailyLessonHours { get; set; } = 8;
    }

    public class CustomerResponse
    {
        public Guid Id { get; set; }
        public string CustomerId { get; set; } = string.Empty;
        public string RelationId { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string? Phone { get; set; }
        public string? Email { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? LicenseExpiresAt { get; set; }
        public bool IsActive { get; set; }
        public int SchoolCount { get; set; }
        public List<string> SchoolNames { get; set; } = new();
        public int TeacherCount { get; set; }
        public int StudentCount { get; set; }
    }

    public class CreateSchoolRequest
    {
        public string Name { get; set; } = string.Empty;
        public string? Address { get; set; }
        public string? Phone { get; set; }
        public string? GeminiApiKey { get; set; }
        public int? DailyLessonHours { get; set; } = 8;
    }


    public class ExtendLicenseRequest
    {
        public Guid TargetId { get; set; } // SchoolId veya UserId veya Customer Admin Id
        public int AdditionalYears { get; set; } = 1;
        public bool IsActive { get; set; } = true;
    }

    public class CreateInstitutionRequest
    {
        public string Code { get; set; } = string.Empty; // Benzersiz Kurum Adı/Kodu
        public string Name { get; set; } = string.Empty; // Kurum Resmi/Görünen Adı
        public int MaxSchoolCount { get; set; } = 2; // Lisanslanan Max Okul Sayısı
        public int AdditionalYears { get; set; } = 1;
        public string? ContactName { get; set; }
        public string? ContactPhone { get; set; }
        public string? ContactEmail { get; set; }
        public string? AdminUsername { get; set; }
        public string? AdminPassword { get; set; }
        public string? AdminFullName { get; set; }
    }

    public class UpdateInstitutionRequest
    {
        public string? Name { get; set; }
        public string? Code { get; set; }
        public int? MaxSchoolCount { get; set; }
        public int? AdditionalYears { get; set; }
        public DateTime? LicenseExpiresAt { get; set; }
        public bool? IsActive { get; set; }
        public string? ContactName { get; set; }
        public string? ContactPhone { get; set; }
        public string? ContactEmail { get; set; }
        public string? AdminUsername { get; set; }
        public string? AdminPassword { get; set; }
    }
}
