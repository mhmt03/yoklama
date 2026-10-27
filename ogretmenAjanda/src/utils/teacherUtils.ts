/**
 * Öğretmen adı ve soyadı eşleştirme yardımcı fonksiyonları.
 * Türkçe karakter duyarsızlığı, unvanlar, büyük/küçük harf ve noktalama işaretlerini
 * doğru şekilde normalize ederek adaş (ör. iki farklı "Mehmet") öğretmenlerin ders ve
 * planlarının birbirine karışmasını kesin olarak engeller.
 */

export function normalizeTeacherName(str?: string | null): string {
  if (!str) return '';
  return str
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * İki öğretmen adının (veya kullanıcı adı / ad-soyad kombinasyonunun)
 * aynı öğretmene ait olup olmadığını yüksek doğrulukla tespit eder.
 */
export function isTeacherMatch(nameA?: string | null, nameB?: string | null): boolean {
  if (!nameA || !nameB) return false;

  const normA = normalizeTeacherName(nameA);
  const normB = normalizeTeacherName(nameB);
  if (!normA || !normB) return false;

  // 1. Birebir eşitlik
  if (normA === normB) return true;

  // Boşluksuz birebir eşitlik (örn. "mehmetgundoner" === "mehmet gundoner")
  const compactA = normA.replace(/\s+/g, '');
  const compactB = normB.replace(/\s+/g, '');
  if (compactA === compactB) return true;

  // 2. Sayısal olmayan en az 2 harfli kelime jetonlarını çıkar
  const tokensA = normA.split(' ').filter((w) => w.length >= 2 && !/^\d+$/.test(w));
  const tokensB = normB.split(' ').filter((w) => w.length >= 2 && !/^\d+$/.test(w));

  if (tokensA.length === 0 || tokensB.length === 0) return false;

  // 3. Eğer her ikisinde de en az 2 kelime varsa (Ad + Soyad)
  if (tokensA.length >= 2 && tokensB.length >= 2) {
    const surnameA = tokensA[tokensA.length - 1];
    const surnameB = tokensB[tokensB.length - 1];

    // Soyadları farklıysa KESİNLİKLE farklı kişilerdir (örn: "Gündöner" vs "Oktay")
    // Adaş öğretmenlerin (Mehmet Gündöner ile Mehmet Oktay) çakışmasını engeller!
    if (surnameA !== surnameB) {
      return false;
    }

    // Soyadları aynı ise, en az bir ad kelimesi uyuşmalıdır
    const firstNamesA = tokensA.slice(0, tokensA.length - 1);
    const firstNamesB = tokensB.slice(0, tokensB.length - 1);
    return firstNamesA.some((fa) => firstNamesB.some((fb) => fa === fb || fa.includes(fb) || fb.includes(fa)));
  }

  // 4. Biri tek kelime (örneğin sadece soyad "gündöner" ya da kullanıcı adı parçası)
  if (tokensA.length === 1) {
    const single = tokensA[0];
    return tokensB.includes(single);
  }
  if (tokensB.length === 1) {
    const single = tokensB[0];
    return tokensA.includes(single);
  }

  // 5. Çoklu kelimeler
  const [shorter, longer] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  return shorter.every((tok) => longer.includes(tok));
}
