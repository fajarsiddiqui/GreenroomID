export function makeWebpThumbnail(ImageMagick, MagickFormat, bytes) {
  return ImageMagick.read(bytes, image => {
    const scale = Math.min(1, 480 / Math.max(image.width, image.height))
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    if (scale < 1) image.resize(width, height)
    image.quality = 73
    const output = image.write(MagickFormat.WebP, data => Uint8Array.from(data))
    return { bytes: output, width: image.width, height: image.height }
  })
}
