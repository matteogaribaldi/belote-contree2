const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const assetsDir = './frontend/src/assets';
const images = ['Subject.png', 'belletta.png', 'belote.png', 'champions.png', 'lory.png'];

async function optimizeImages() {
  console.log('Starting image optimization...\n');

  for (const image of images) {
    const inputPath = path.join(assetsDir, image);
    const webpPath = path.join(assetsDir, image.replace('.png', '.webp'));
    const compressedPngPath = inputPath; // Sovrascrivi il PNG originale

    try {
      // Get original size
      const originalStats = fs.statSync(inputPath);
      const originalSize = (originalStats.size / 1024 / 1024).toFixed(2);

      // Convert to WebP
      await sharp(inputPath)
        .webp({ quality: 85 })
        .toFile(webpPath);

      const webpStats = fs.statSync(webpPath);
      const webpSize = (webpStats.size / 1024 / 1024).toFixed(2);

      // Compress PNG
      await sharp(inputPath)
        .png({ quality: 85, compressionLevel: 9 })
        .toFile(inputPath + '.tmp');

      fs.renameSync(inputPath + '.tmp', inputPath);

      const compressedStats = fs.statSync(inputPath);
      const compressedSize = (compressedStats.size / 1024 / 1024).toFixed(2);

      console.log(`✅ ${image}`);
      console.log(`   Original:   ${originalSize} MB`);
      console.log(`   WebP:       ${webpSize} MB (${((1 - webpStats.size / originalStats.size) * 100).toFixed(1)}% reduction)`);
      console.log(`   PNG (opt):  ${compressedSize} MB (${((1 - compressedStats.size / originalStats.size) * 100).toFixed(1)}% reduction)\n`);

    } catch (error) {
      console.error(`❌ Error processing ${image}:`, error.message);
    }
  }

  console.log('Optimization complete!');
}

optimizeImages();
