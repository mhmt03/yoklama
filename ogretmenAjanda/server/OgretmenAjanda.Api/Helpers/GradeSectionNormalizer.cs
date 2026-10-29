using System.Text.RegularExpressions;

namespace OgretmenAjanda.Api.Helpers
{
    public static class GradeSectionNormalizer
    {
        private static readonly Regex CombinedRegex = new Regex(@"^(\d{1,2})[-/.\s]*([A-Za-zÇĞİÖŞÜçğıöşü]+)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex DigitsOnlyRegex = new Regex(@"\d+", RegexOptions.Compiled);

        /// <summary>
        /// Verilen ham sınıf düzeyi ve şube bilgisinden (örn: "9. Sınıf", "9-A", "9/A", "9A", "A")
        /// standart (Grade: "9", Section: "A") değerlerini çıkarır.
        /// </summary>
        public static (string Grade, string Section) Normalize(string? rawGrade, string? rawSection)
        {
            var g = (rawGrade ?? "").Trim();
            var s = (rawSection ?? "").Trim();

            // Eğer şube içinde "9-A", "9/A", "10B" gibi birleşik bilgi varsa
            var matchS = CombinedRegex.Match(s);
            if (matchS.Success)
            {
                var detectedGrade = matchS.Groups[1].Value;
                var detectedSection = matchS.Groups[2].Value.ToUpperInvariant();
                return (detectedGrade, detectedSection);
            }

            // Eğer grade içinde "9-A" gibi birleşik bilgi varsa
            var matchG = CombinedRegex.Match(g);
            if (matchG.Success)
            {
                var detectedGrade = matchG.Groups[1].Value;
                var detectedSection = matchG.Groups[2].Value.ToUpperInvariant();
                // Eğer s zaten geçerli tek bir harfse s'yi koru, yoksa tespit edileni kullan
                var finalSection = !string.IsNullOrEmpty(s) && s.Length <= 2 ? s.ToUpperInvariant() : detectedSection;
                return (detectedGrade, finalSection);
            }

            // Grade'den sadece sayıları ayıkla ("9. Sınıf" -> "9", "10. Sınıf" -> "10")
            var gradeDigits = DigitsOnlyRegex.Match(g);
            var cleanGrade = gradeDigits.Success ? gradeDigits.Value : g;

            // Section'dan fazlalıkları temizle ("A Şubesi" -> "A")
            var cleanSection = s.Replace("Şubesi", "", System.StringComparison.OrdinalIgnoreCase)
                                .Replace("Şube", "", System.StringComparison.OrdinalIgnoreCase)
                                .Trim()
                                .ToUpperInvariant();

            if (string.IsNullOrEmpty(cleanGrade) && !string.IsNullOrEmpty(cleanSection))
            {
                // Section içinde rakam var mı kontrol et
                var numMatch = DigitsOnlyRegex.Match(cleanSection);
                if (numMatch.Success)
                {
                    cleanGrade = numMatch.Value;
                    cleanSection = DigitsOnlyRegex.Replace(cleanSection, "").Trim();
                }
            }

            if (string.IsNullOrEmpty(cleanGrade)) cleanGrade = "9";
            if (string.IsNullOrEmpty(cleanSection)) cleanSection = "A";

            return (cleanGrade, cleanSection);
        }
    }
}
