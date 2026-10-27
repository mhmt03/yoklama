const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

// 1. Dosya Yolları
const versionTxtPath = path.join(rootDir, 'server', 'OgretmenAjanda.Api', 'wwwroot', 'version.txt');
const publishVersionTxtPath = path.join(rootDir, 'server', 'OgretmenAjanda.Api', 'publish', 'wwwroot', 'version.txt');

const versionJsonPath = path.join(rootDir, 'server', 'OgretmenAjanda.Api', 'wwwroot', 'version.json');
const publishVersionJsonPath = path.join(rootDir, 'server', 'OgretmenAjanda.Api', 'publish', 'wwwroot', 'version.json');

const appJsonPath = path.join(rootDir, 'app.json');
const packageJsonPath = path.join(rootDir, 'package.json');
const appUpdateServicePath = path.join(rootDir, 'src', 'services', 'appUpdateService.ts');

// 2. Mevcut Sürümü Oku
let currentVersion = '1.0.2';
let currentVersionCode = 3;

if (fs.existsSync(appJsonPath)) {
  try {
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    if (appJson.expo?.version) currentVersion = appJson.expo.version;
    if (appJson.expo?.android?.versionCode) currentVersionCode = appJson.expo.android.versionCode;
  } catch (e) {}
}

// 3. Sürüm ve VersionCode Artır (Örn: 1.0.2 -> 1.0.3, versionCode: 3 -> 4)
const parts = currentVersion.split('.').map(n => parseInt(n, 10) || 0);
while (parts.length < 3) parts.push(0);
parts[2] += 1;
const newVersion = parts.join('.');
const newVersionCode = currentVersionCode + 1;

console.log(`\n======================================================`);
console.log(`🚀 SÜRÜM OTOMATİK ARTIRILIYOR:`);
console.log(`   Önceki Sürüm: v${currentVersion} (kod: ${currentVersionCode})`);
console.log(`   Yeni Sürüm:   v${newVersion} (kod: ${newVersionCode})`);
console.log(`======================================================\n`);

// 4. app.json Güncelle
if (fs.existsSync(appJsonPath)) {
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  appJson.expo.version = newVersion;
  if (!appJson.expo.android) appJson.expo.android = {};
  appJson.expo.android.versionCode = newVersionCode;
  if (!appJson.expo.ios) appJson.expo.ios = {};
  appJson.expo.ios.buildNumber = String(newVersionCode);
  fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n', 'utf8');
  console.log(`✅ app.json güncellendi: v${newVersion} (kod: ${newVersionCode})`);
}

// 5. package.json Güncelle
if (fs.existsSync(packageJsonPath)) {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  pkg.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`✅ package.json güncellendi: v${newVersion}`);
}

// 6. src/services/appUpdateService.ts Güncelle (Mobil uygulama içindeki sürüm sabiti)
if (fs.existsSync(appUpdateServicePath)) {
  let content = fs.readFileSync(appUpdateServicePath, 'utf8');
  content = content.replace(/export const CURRENT_APP_VERSION = ['"][^'"]+['"];/, `export const CURRENT_APP_VERSION = '${newVersion}';`);
  content = content.replace(/export const CURRENT_VERSION_CODE = \d+;/, `export const CURRENT_VERSION_CODE = ${newVersionCode};`);
  fs.writeFileSync(appUpdateServicePath, content, 'utf8');
  console.log(`✅ appUpdateService.ts güncellendi: CURRENT_APP_VERSION='${newVersion}', CURRENT_VERSION_CODE=${newVersionCode}`);
}

// 7. server wwwroot/version.txt Güncelle
const writeTxt = (p) => {
  if (fs.existsSync(path.dirname(p))) {
    fs.writeFileSync(p, newVersion + '\n', 'utf8');
    console.log(`✅ version.txt güncellendi: ${p}`);
  }
};
writeTxt(versionTxtPath);
writeTxt(publishVersionTxtPath);

const customNote = process.env.RELEASE_NOTES || "Mehmet yeni bir güncelleme oluşturdu, sisteminizdeki uygulamanın daha sağlıklı çalışması için güncelleme yapmalısınız.";

// 8. server wwwroot/version.json Güncelle
const writeJson = (p) => {
  if (fs.existsSync(path.dirname(p))) {
    let json = {
      version: newVersion,
      versionCode: newVersionCode,
      downloadUrl: "http://ogretmenajanda.runasp.net/api/apk",
      releaseNotes: customNote,
      publishedAt: new Date().toISOString()
    };
    if (fs.existsSync(p)) {
      try {
        const old = JSON.parse(fs.readFileSync(p, 'utf8'));
        json = { ...old, version: newVersion, versionCode: newVersionCode, releaseNotes: customNote, publishedAt: new Date().toISOString() };
      } catch (e) {}
    }
    fs.writeFileSync(p, JSON.stringify(json, null, 2) + '\n', 'utf8');
    console.log(`✅ version.json güncellendi: ${p}`);
  }
};
writeJson(versionJsonPath);
writeJson(publishVersionJsonPath);

console.log(`\n🎉 Tüm sürüm dosyaları başarıyla eşitlendi! Yeni sürüm: v${newVersion} (kod: ${newVersionCode})\n`);
