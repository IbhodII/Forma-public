# Сборка release APK (arm64). Запуск из mobile/:  .\scripts\android-release.ps1
$ErrorActionPreference = "Stop"
$mobileRoot = Split-Path $PSScriptRoot -Parent
$androidDir = Join-Path $mobileRoot "android"
$jdk = "C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot"

$env:JAVA_HOME = $jdk

$cxxDirs = @(
    (Join-Path $mobileRoot "node_modules\react-native-worklets-core\android\.cxx"),
    (Join-Path $mobileRoot "node_modules\react-native-worklets-core\android\build"),
    (Join-Path $mobileRoot "node_modules\react-native-vision-camera\android\.cxx"),
    (Join-Path $mobileRoot "node_modules\react-native-vision-camera\android\build"),
    (Join-Path $mobileRoot "node_modules\react-native-reanimated\android\.cxx"),
    (Join-Path $androidDir "app\build")
)

foreach ($d in $cxxDirs) {
    if (Test-Path $d) {
        Write-Host "Removing $d"
        Remove-Item -Recurse -Force $d
    }
}

Set-Location $androidDir
.\gradlew.bat --stop
.\gradlew.bat clean :react-native-worklets-core:buildCMakeRelWithDebInfo[arm64-v8a] assembleRelease `
    -PreactNativeArchitectures=arm64-v8a

$apk = Join-Path $androidDir "app\build\outputs\apk\release\app-release.apk"
if (Test-Path $apk) {
    $mb = [math]::Round((Get-Item $apk).Length / 1MB, 1)
    Write-Host ""
    Write-Host "OK: $apk ($mb MB)" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "APK not found. Scroll up for the first FAILED / error: line." -ForegroundColor Red
    exit 1
}
