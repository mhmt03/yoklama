using System.Diagnostics;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using yoklamaWeb.Data;
using yoklamaWeb.Models;

namespace yoklamaWeb.Controllers
{
    public class HomeController : Controller
    {
        private readonly AppDbContext _context;

        public HomeController(AppDbContext context)
        {
            _context = context;
        }

        public IActionResult Index()
        {
            return View();
        }

        [HttpGet]
        public async Task<IActionResult> FindExamSeat(string studentNo)
        {
            if (string.IsNullOrWhiteSpace(studentNo))
            {
                return Json(new { success = false, message = "Lütfen öğrenci numarası giriniz." });
            }

            studentNo = studentNo.Trim();

            var seatings = await _context.PlannerSeatings
                .Include(s => s.PlannerExam)
                .Where(s => s.OgrenciNo == studentNo)
                .ToListAsync();

            var now = DateTime.Now;
            var resultList = new List<object>();

            foreach (var seat in seatings)
            {
                if (seat.PlannerExam == null) continue;

                var examDateTime = seat.PlannerExam.ExamDate.Date;
                if (TimeSpan.TryParse(seat.PlannerExam.StartTime, out var timeSpan))
                {
                    examDateTime = examDateTime.Add(timeSpan);
                }
                else
                {
                    examDateTime = examDateTime.AddHours(9);
                }

                if (examDateTime < now)
                {
                    continue;
                }

                resultList.Add(new
                {
                    examName = seat.PlannerExam.Name,
                    examDate = seat.PlannerExam.ExamDate.ToString("dd.MM.yyyy"),
                    examTime = seat.PlannerExam.StartTime,
                    studentName = MaskName(seat.AdSoyad),
                    roomName = seat.RoomName,
                    seatNumber = seat.SeatNumber,
                    sira = seat.Sira
                });
            }

            if (!resultList.Any())
            {
                return Json(new { success = false, message = "Bu öğrenci numarasına ait aktif bir sınav yerleşimi bulunamadı." });
            }

            return Json(new { success = true, data = resultList });
        }

        private string MaskName(string fullName)
        {
            if (string.IsNullOrWhiteSpace(fullName)) return string.Empty;

            var words = fullName.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            var maskedWords = words.Select(word =>
            {
                if (word.Length <= 2)
                {
                    return word[0] + new string('*', word.Length - 1);
                }
                else
                {
                    return word.Substring(0, 2) + new string('*', word.Length - 2);
                }
            });

            return string.Join(" ", maskedWords);
        }

        [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
        public IActionResult Error()
        {
            return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
        }
    }
}
