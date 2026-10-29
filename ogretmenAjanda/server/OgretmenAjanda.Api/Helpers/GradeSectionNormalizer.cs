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

            // Roma rakamları desteği (örn: XI-A, XII/B, X, IX)
            string ConvertRoman(string text)
            {
                if (string.IsNullOrWhiteSpace(text)) return text;
                var res = text;
                res = Regex.Replace(res, @"\bXII\b", "12", RegexOptions.IgnoreCase);
                res = Regex.Replace(res, @"\bXI\b", "11", RegexOptions.IgnoreCase);
                res = Regex.Replace(res, @"\bX\b", "10", RegexOptions.IgnoreCase);
                res = Regex.Replace(res, @"\bIX\b", "9", RegexOptions.IgnoreCase);
                return res;
            }

            g = ConvertRoman(g);
            s = ConvertRoman(s);

            // Eğer şube içinde "11-A", "11/A", "12B", "9. Sınıf A" gibi birleşik bilgi varsa
            var matchS = CombinedRegex.Match(s);
            if (matchS.Success)
            {
                var detectedGrade = matchS.Groups[1].Value;
                var detectedSection = matchS.Groups[2].Value.ToUpperInvariant();
                return (detectedGrade, detectedSection);
            }

            // Eğer grade içinde "11-A" gibi birleşik bilgi varsa
            var matchG = CombinedRegex.Match(g);
            if (matchG.Success)
            {
                var detectedGrade = matchG.Groups[1].Value;
                var detectedSection = matchG.Groups[2].Value.ToUpperInvariant();
                var finalSection = !string.IsNullOrEmpty(s) && s.Length <= 2 ? s.ToUpperInvariant() : detectedSection;
                return (detectedGrade, finalSection);
            }

            // Grade'den sadece sayıları ayıkla ("11. Sınıf" -> "11", "12. Sınıf" -> "12")
            var gradeDigits = DigitsOnlyRegex.Match(g);
            var cleanGrade = gradeDigits.Success ? gradeDigits.Value : g;

            // Section'dan fazlalıkları temizle ("A Şubesi" -> "A")
            var cleanSection = s.Replace("Şubesi", "", StringComparison.OrdinalIgnoreCase)
                                .Replace("Şube", "", StringComparison.OrdinalIgnoreCase)
                                .Replace("Sınıfı", "", StringComparison.OrdinalIgnoreCase)
                                .Replace("Sınıf", "", StringComparison.OrdinalIgnoreCase)
                                .Trim()
                                .ToUpperInvariant();

            // Eğer grade boş ama section içinde rakam varsa (örn: section = "11-A" veya "11")
            if (string.IsNullOrEmpty(cleanGrade) && !string.IsNullOrEmpty(cleanSection))
            {
                var numMatch = DigitsOnlyRegex.Match(cleanSection);
                if (numMatch.Success)
                {
                    cleanGrade = numMatch.Value;
                    cleanSection = DigitsOnlyRegex.Replace(cleanSection, "").Replace("-", "").Replace("/", "").Trim();
                }
            }

            // Eğer section boş ama grade içinde şube harfi kalmışsa
            if (string.IsNullOrEmpty(cleanSection) && !string.IsNullOrEmpty(g))
            {
                var letterMatch = Regex.Match(g, @"[A-Za-zÇĞİÖŞÜçğıöşü]+");
                if (letterMatch.Success)
                {
                    cleanSection = letterMatch.Value.ToUpperInvariant();
                }
            }

            if (string.IsNullOrEmpty(cleanGrade)) cleanGrade = "9";
            if (string.IsNullOrEmpty(cleanSection)) cleanSection = "A";

            return (cleanGrade, cleanSection);
        }
    }
}
