/**
 * Выравнивает Kotlin в react-native-vision-camera-mlkit-plugin с корневым проектом.
 * Иначе EAS/Gradle: incompatible Kotlin metadata / unauthorized_client-style native errors.
 */
const fs = require('fs');
const path = require('path');

const mlkitGradle = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-vision-camera-mlkit-plugin',
  'android',
  'build.gradle',
);

if (!fs.existsSync(mlkitGradle)) {
  console.warn('[patch-android-native] mlkit plugin not installed, skip');
  process.exit(0);
}

let src = fs.readFileSync(mlkitGradle, 'utf8');
const before = src;

src = src.replace(
  /ext\.kotlin_version\s*=\s*['"][\d.]+['"]/,
  "ext.kotlin_version = rootProject.ext.has('kotlinVersion') ? rootProject.ext.get('kotlinVersion') : '1.9.25'",
);

if (src === before) {
  console.log('[patch-android-native] mlkit kotlin already patched');
} else {
  fs.writeFileSync(mlkitGradle, src);
  console.log('[patch-android-native] patched mlkit kotlin_version → root kotlinVersion');
}
