import { PDFDocument } from "pdf-lib"

const CM_TO_POINTS = 28.3464567
const WATERMARK_BOX_CM = 10
const WATERMARK_OPACITY = 0.5

const loadImageFromBlob = (blob) => new Promise((resolve, reject) => {
  const objectUrl = URL.createObjectURL(blob)
  const image = new Image()
  image.onload = () => {
    URL.revokeObjectURL(objectUrl)
    resolve(image)
  }
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl)
    reject(new Error('Gagal membaca file logo untuk watermark preview.'))
  }
  image.src = objectUrl
})

const blobToArrayBuffer = async (blob) => {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return new Response(blob).arrayBuffer()
}

const rasterizeSvgBlob = async (svgBlob) => {
  const image = await loadImageFromBlob(svgBlob)
  const canvas = document.createElement('canvas')
  const width = image.naturalWidth || 1200
  const height = image.naturalHeight || 1200
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  if (!context) throw new Error('Browser tidak mendukung canvas untuk watermark preview.')

  context.clearRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)

  const pngBlob = await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Gagal mengubah logo SVG menjadi PNG untuk watermark preview.'))
    }, 'image/png')
  })

  return blobToArrayBuffer(pngBlob)
}

const getImageSourceForPdf = async (logoUrl) => {
  const response = await fetch(logoUrl)
  if (!response.ok) throw new Error('Logo branding SEO tidak dapat diambil. Pastikan URL logo dapat diakses publik.')

  const contentType = (response.headers.get('content-type') || '').toLowerCase()
  const logoBlob = await response.blob()
  const inferredType = logoBlob.type || contentType

  if (inferredType.includes('svg')) {
    const bytes = await rasterizeSvgBlob(logoBlob)
    return { bytes, type: 'png' }
  }

  if (inferredType.includes('png') || inferredType.includes('webp')) {
    return { bytes: await blobToArrayBuffer(logoBlob), type: 'png' }
  }

  if (inferredType.includes('jpeg') || inferredType.includes('jpg')) {
    return { bytes: await blobToArrayBuffer(logoBlob), type: 'jpg' }
  }

  throw new Error('Format logo branding SEO belum didukung untuk watermark preview. Gunakan PNG, JPG, WEBP, atau SVG.')
}

const fitWithinSquare = (imageWidth, imageHeight, boxSize) => {
  if (!imageWidth || !imageHeight) return { width: boxSize, height: boxSize }

  const ratio = imageWidth / imageHeight
  if (ratio >= 1) {
    return { width: boxSize, height: boxSize / ratio }
  }

  return { width: boxSize * ratio, height: boxSize }
}

const reportProgress = (onProgress, percent, message) => {
  if (typeof onProgress === 'function') onProgress({ percent, message })
}

export async function createPreviewPdfWithWatermark({ pdfFile, logoUrl, onProgress }) {
  if (!pdfFile) throw new Error('Pilih file preview PDF terlebih dahulu.')
  if (!logoUrl) throw new Error('Logo branding SEO belum diatur.')

  reportProgress(onProgress, 5, 'Mengambil logo branding SEO...')
  const logoSource = await getImageSourceForPdf(logoUrl)

  reportProgress(onProgress, 15, 'Membaca PDF preview...')
  const pdfArrayBuffer = await pdfFile.arrayBuffer()
  const pdfDoc = await PDFDocument.load(pdfArrayBuffer)
  const pages = pdfDoc.getPages()
  const totalPages = pages.length
  const targetPageIndexes = pages
    .map((_, index) => index)
    .filter((index) => (index + 1) % 5 === 0)

  if (targetPageIndexes.length === 0) {
    reportProgress(onProgress, 75, 'Preview kurang dari 5 halaman. Tidak ada watermark yang perlu ditambahkan.')
    return new File([pdfArrayBuffer], pdfFile.name, { type: 'application/pdf' })
  }

  reportProgress(onProgress, 25, `Menyiapkan watermark untuk ${targetPageIndexes.length} halaman...`)
  const embeddedImage = logoSource.type === 'jpg'
    ? await pdfDoc.embedJpg(logoSource.bytes)
    : await pdfDoc.embedPng(logoSource.bytes)

  const watermarkBox = WATERMARK_BOX_CM * CM_TO_POINTS
  const imageDimensions = fitWithinSquare(embeddedImage.width, embeddedImage.height, watermarkBox)

  for (let position = 0; position < targetPageIndexes.length; position += 1) {
    const pageIndex = targetPageIndexes[position]
    const page = pages[pageIndex]
    const pageNumber = pageIndex + 1
    const x = (page.getWidth() - imageDimensions.width) / 2
    const y = (page.getHeight() - imageDimensions.height) / 2

    page.drawImage(embeddedImage, {
      x,
      y,
      width: imageDimensions.width,
      height: imageDimensions.height,
      opacity: WATERMARK_OPACITY
    })

    const percent = Math.min(75, Math.round(25 + (((position + 1) / targetPageIndexes.length) * 50)))
    reportProgress(onProgress, percent, `Menambahkan watermark pada halaman ${pageNumber} dari ${totalPages}...`)
  }

  reportProgress(onProgress, 82, 'Menyimpan PDF preview ber-watermark...')
  const watermarkedBytes = await pdfDoc.save()
  reportProgress(onProgress, 88, 'Preview siap diupload ke storage...')

  return new File([watermarkedBytes], pdfFile.name, { type: 'application/pdf' })
}
