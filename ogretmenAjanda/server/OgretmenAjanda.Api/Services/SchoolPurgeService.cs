using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using OgretmenAjanda.Api.Data;
using OgretmenAjanda.Api.Models;

namespace OgretmenAjanda.Api.Services
{
    public interface ISchoolPurgeService
    {
        Task<SchoolPurgeResult> PurgeSchoolAsync(AppDbContext context, Guid schoolId);
        Task<SchoolPurgeResult> CleanupOrphanDataAsync(AppDbContext context);
    }

    public class SchoolPurgeResult
    {
        public bool Success { get; set; }
        public string SchoolName { get; set; } = string.Empty;
        public int DeletedClassesCount { get; set; }
        public int DeletedLessonsCount { get; set; }
        public int DeletedSchedulesCount { get; set; }
        public int DeletedDutiesCount { get; set; }
        public int DeletedStudentsCount { get; set; }
        public int DeletedAssignmentsCount { get; set; }
        public int DeletedTeachersCount { get; set; }
        public int RetainedMultiSchoolTeachersCount { get; set; }
        public string Message { get; set; } = string.Empty;
    }

    public class SchoolPurgeService : ISchoolPurgeService
    {
        public async Task<SchoolPurgeResult> PurgeSchoolAsync(AppDbContext context, Guid schoolId)
        {
            var school = await context.Schools.FindAsync(schoolId);
            if (school == null)
            {
                return new SchoolPurgeResult
                {
                    Success = false,
                    Message = "Silinecek okul bulunamadı."
                };
            }

            var schoolName = school.Name;
            var schoolIdStr = schoolId.ToString();

            // 1. Doğrudan okula bağlı tabloların temizliği (Cascade)
            var classes = await context.SchoolClasses.Where(c => c.SchoolId == schoolId).ToListAsync();
            context.SchoolClasses.RemoveRange(classes);

            var lessons = await context.SchoolLessons.Where(l => l.SchoolId == schoolId).ToListAsync();
            context.SchoolLessons.RemoveRange(lessons);

            var schedules = await context.ScheduleItems.Where(s => s.SchoolId == schoolId).ToListAsync();
            context.ScheduleItems.RemoveRange(schedules);

            var duties = await context.TeacherDuties.Where(d => d.SchoolId == schoolId).ToListAsync();
            context.TeacherDuties.RemoveRange(duties);

            var students = await context.Students.Where(st => st.SchoolId == schoolId).ToListAsync();
            context.Students.RemoveRange(students);

            var assignments = await context.Assignments.Where(a => a.SchoolId == schoolId).ToListAsync();
            var assignmentIds = assignments.Select(a => a.Id).ToList();
            if (assignmentIds.Count > 0)
            {
                var submissions = await context.AssignmentSubmissions.Where(sub => assignmentIds.Contains(sub.AssignmentId)).ToListAsync();
                context.AssignmentSubmissions.RemoveRange(submissions);
            }
            context.Assignments.RemoveRange(assignments);

            var yearlyPlans = await context.YearlyPlanItems.Where(y => y.SchoolId == schoolId).ToListAsync();
            context.YearlyPlanItems.RemoveRange(yearlyPlans);

            var messages = await context.AppMessages.Where(m => m.SchoolId == schoolId).ToListAsync();
            context.AppMessages.RemoveRange(messages);

            var logs = await context.AuditLogs.Where(a => a.SchoolId == schoolId).ToListAsync();
            context.AuditLogs.RemoveRange(logs);

            // 2. ÖĞRETMEN VE PERSONEL TEMİZLİĞİ:
            // Bu okula bağlı olan tüm öğretmenler ve idari personeller
            var teachers = await context.Users
                .Where(u => (u.Role == UserRoles.Teacher || u.Role == UserRoles.Staff) &&
                            (u.SchoolId == schoolId || (!string.IsNullOrEmpty(u.AssignedSchoolIdsJson) && u.AssignedSchoolIdsJson.Contains(schoolIdStr))))
                .ToListAsync();

            int deletedTeachersCount = 0;
            int retainedTeachersCount = 0;

            // Diğer TÜM aktif okulları hafızaya al
            var otherActiveSchools = await context.Schools
                .Where(s => s.Id != schoolId && s.IsActive)
                .Select(s => s.Id)
                .ToListAsync();
            var otherActiveSchoolSet = otherActiveSchools.ToHashSet();

            foreach (var teacher in teachers)
            {
                // Öğretmenin diğer okullarını topla
                var validOtherSchoolIds = new List<Guid>();

                if (teacher.SchoolId.HasValue && teacher.SchoolId.Value != schoolId && otherActiveSchoolSet.Contains(teacher.SchoolId.Value))
                {
                    validOtherSchoolIds.Add(teacher.SchoolId.Value);
                }

                if (!string.IsNullOrEmpty(teacher.AssignedSchoolIdsJson))
                {
                    try
                    {
                        var parsed = JsonSerializer.Deserialize<List<string>>(teacher.AssignedSchoolIdsJson);
                        if (parsed != null)
                        {
                            foreach (var pId in parsed)
                            {
                                if (Guid.TryParse(pId, out var parsedGuid) && parsedGuid != schoolId && otherActiveSchoolSet.Contains(parsedGuid))
                                {
                                    if (!validOtherSchoolIds.Contains(parsedGuid))
                                    {
                                        validOtherSchoolIds.Add(parsedGuid);
                                    }
                                }
                            }
                        }
                    }
                    catch { }
                }

                // KARAR:
                if (validOtherSchoolIds.Count > 0)
                {
                    // ÖĞRETMEN BAŞKA BİR AKTİF OKULDA DA GÖREV YAPIYOR! KESİNLİKLE SİLİNMEZ.
                    // Yalnızca silinen okulun ID'si ilişiğinden koparılır:
                    teacher.AssignedSchoolIdsJson = JsonSerializer.Serialize(validOtherSchoolIds.Select(id => id.ToString()).ToList());
                    if (teacher.SchoolId == schoolId)
                    {
                        teacher.SchoolId = validOtherSchoolIds.First();
                    }
                    retainedTeachersCount++;
                }
                else
                {
                    // Öğretmenin başka hiçbir okulu yok -> Tamamen silinir
                    context.Users.Remove(teacher);
                    deletedTeachersCount++;
                }
            }

            // 3. Okulun kendisini sil
            context.Schools.Remove(school);

            await context.SaveChangesAsync();

            return new SchoolPurgeResult
            {
                Success = true,
                SchoolName = schoolName,
                DeletedClassesCount = classes.Count,
                DeletedLessonsCount = lessons.Count,
                DeletedSchedulesCount = schedules.Count,
                DeletedDutiesCount = duties.Count,
                DeletedStudentsCount = students.Count,
                DeletedAssignmentsCount = assignments.Count,
                DeletedTeachersCount = deletedTeachersCount,
                RetainedMultiSchoolTeachersCount = retainedTeachersCount,
                Message = $"'{schoolName}' okulu ve ilişkili tüm verileri başarıyla silindi. ({deletedTeachersCount} öğretmen silindi, {retainedTeachersCount} çoklu okul öğretmeni korundu)."
            };
        }

        public async Task<SchoolPurgeResult> CleanupOrphanDataAsync(AppDbContext context)
        {
            // 1. Sistemdeki AKTİF okulları belirle
            var activeSchoolIds = await context.Schools
                .Where(s => s.IsActive)
                .Select(s => s.Id)
                .ToListAsync();
            var activeSchoolSet = activeSchoolIds.ToHashSet();
            var activeSchoolIdStrings = activeSchoolIds.Select(id => id.ToString()).ToList();

            // 2. Pasif (silinmiş olarak işaretlenmiş) okulları tamamen temizle
            var inactiveSchools = await context.Schools
                .Where(s => !s.IsActive)
                .ToListAsync();

            int deletedTeachersTotal = 0;
            int retainedTeachersTotal = 0;
            int deletedSchoolsTotal = inactiveSchools.Count;

            foreach (var inactiveSchool in inactiveSchools)
            {
                var res = await PurgeSchoolAsync(context, inactiveSchool.Id);
                deletedTeachersTotal += res.DeletedTeachersCount;
                retainedTeachersTotal += res.RetainedMultiSchoolTeachersCount;
            }

            // 3. Hiçbir aktif okula bağlı olmayan YETİM öğretmenleri temizle
            var allTeachers = await context.Users
                .Where(u => u.Role == UserRoles.Teacher || u.Role == UserRoles.Staff)
                .ToListAsync();

            int orphanTeachersRemoved = 0;
            foreach (var teacher in allTeachers)
            {
                bool hasActiveSchool = false;
                if (teacher.SchoolId.HasValue && activeSchoolSet.Contains(teacher.SchoolId.Value))
                {
                    hasActiveSchool = true;
                }
                else if (!string.IsNullOrEmpty(teacher.AssignedSchoolIdsJson))
                {
                    try
                    {
                        var parsed = JsonSerializer.Deserialize<List<string>>(teacher.AssignedSchoolIdsJson);
                        if (parsed != null && parsed.Any(p => Guid.TryParse(p, out var g) && activeSchoolSet.Contains(g)))
                        {
                            hasActiveSchool = true;
                        }
                    }
                    catch { }
                }

                if (!hasActiveSchool)
                {
                    context.Users.Remove(teacher);
                    orphanTeachersRemoved++;
                }
            }

            // 4. Hiçbir aktif okula bağlı olmayan YETİM öğrencileri temizle
            var orphanStudents = await context.Students
                .Where(st => !activeSchoolSet.Contains(st.SchoolId))
                .ToListAsync();
            context.Students.RemoveRange(orphanStudents);

            // 5. Hiçbir aktif okula bağlı olmayan YETİM ders programlarını temizle
            var orphanSchedules = await context.ScheduleItems
                .Where(s => !activeSchoolSet.Contains(s.SchoolId))
                .ToListAsync();
            context.ScheduleItems.RemoveRange(orphanSchedules);

            // 6. Hiçbir aktif okula bağlı olmayan YETİM nöbetleri temizle
            var orphanDuties = await context.TeacherDuties
                .Where(d => !activeSchoolSet.Contains(d.SchoolId))
                .ToListAsync();
            context.TeacherDuties.RemoveRange(orphanDuties);

            // 7. Hiçbir aktif okula bağlı olmayan YETİM sınıfları ve dersleri temizle
            var orphanClasses = await context.SchoolClasses
                .Where(c => !activeSchoolSet.Contains(c.SchoolId))
                .ToListAsync();
            context.SchoolClasses.RemoveRange(orphanClasses);

            var orphanLessons = await context.SchoolLessons
                .Where(l => !activeSchoolSet.Contains(l.SchoolId))
                .ToListAsync();
            context.SchoolLessons.RemoveRange(orphanLessons);

            await context.SaveChangesAsync();

            return new SchoolPurgeResult
            {
                Success = true,
                DeletedTeachersCount = deletedTeachersTotal + orphanTeachersRemoved,
                DeletedStudentsCount = orphanStudents.Count,
                DeletedSchedulesCount = orphanSchedules.Count,
                DeletedDutiesCount = orphanDuties.Count,
                DeletedClassesCount = orphanClasses.Count,
                DeletedLessonsCount = orphanLessons.Count,
                Message = $"Veritabanı yetim ve silinmiş kayıt temizliği tamamlandı. ({deletedSchoolsTotal} pasif okul, {deletedTeachersTotal + orphanTeachersRemoved} yetim öğretmen, {orphanStudents.Count} yetim öğrenci temizlendi)."
            };
        }
    }
}
