import PDFDocument from 'pdfkit'
import moment from 'moment'
import http from 'http'
import https from 'https'
import { promises as fs } from 'fs'
import path from 'path'

const formatCurrency = (value) => {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'number') {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }

  const normalized = String(value).trim()

  if (!normalized) {
    return ''
  }

  const numeric = Number(normalized.replace(/,/g, ''))

  if (Number.isNaN(numeric)) {
    return normalized
  }

  return numeric.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

const toNumber = (value) => {
  if (value === null || value === undefined) {
    return 0
  }

  if (typeof value === 'number') {
    return value
  }

  const numeric = Number(String(value).replace(/,/g, ''))
  return Number.isFinite(numeric) ? numeric : 0
}

const colors = {
  text: '#0f172a',
  muted: '#64748b',
  primary: '#2563eb',
  primaryDark: '#1d4ed8',
  lightBg: '#f8fafc',
  border: '#e2e8f0',
  white: '#ffffff',
  success: '#22c55e',
  warning: '#f97316',
  danger: '#ef4444'
}

const MAX_LOGO_BYTES = 5 * 1024 * 1024

const isPng = (buffer) => buffer && buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
const isJpeg = (buffer) => buffer && buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
const isSupportedImage = (buffer) => isPng(buffer) || isJpeg(buffer)

const warnUnsupportedLogo = (logo) => {
  if (!logo) {
    return
  }

  try {
    const preview = typeof logo === 'string' ? logo.slice(0, 80) : '<buffer>'
    console.warn('Skipping invoice logo: unsupported image format detected.', preview)
  } catch (_) {
    console.warn('Skipping invoice logo: unsupported image format detected.')
  }
}

const maybeForceCloudinaryFormat = (url, format = 'png') => {
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.includes('res.cloudinary.com')) {
      return null
    }

    const segments = parsed.pathname.split('/').filter(Boolean)
    const uploadIndex = segments.indexOf('upload')
    if (uploadIndex === -1) {
      return null
    }

    const prefix = segments.slice(0, uploadIndex + 1)
    const rest = segments.slice(uploadIndex + 1)

    if (!rest.length) {
      return null
    }

    const hasFormat = rest.some((segment) => segment.startsWith('f_'))
    if (hasFormat) {
      return null
    }

    const versionIndex = rest.findIndex((segment) => /^v\d+/.test(segment))
    const formatSegment = `f_${format}`
    const newRest = [...rest]

    if (versionIndex === -1) {
      newRest.unshift(formatSegment)
    } else {
      newRest.splice(versionIndex, 0, formatSegment)
    }

    const newPath = `/${[...prefix, ...newRest].join('/')}`
    return `${parsed.origin}${newPath}${parsed.search}${parsed.hash}`
  } catch (_) {
    return null
  }
}

const fetchBufferFromUrl = (url, options = {}) => new Promise((resolve, reject) => {
  const { redirects = 0, attemptedFallback = false } = options
  if (!url) {
    return resolve(null)
  }

  const isHttps = url.startsWith('https://')
  const client = isHttps ? https : http

  const request = client.get(url, (response) => {
    if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects < 3) {
      response.resume()
      return fetchBufferFromUrl(response.headers.location, {
        redirects: redirects + 1,
        attemptedFallback
      }).then(resolve).catch(reject)
    }

    if (response.statusCode !== 200) {
      response.resume()
      return resolve(null)
    }

    const chunks = []
    const contentType = String(response.headers['content-type'] || '').toLowerCase()
    let totalBytes = 0

    response.on('data', (chunk) => {
      totalBytes += chunk.length
      if (totalBytes > MAX_LOGO_BYTES) {
        request.destroy(new Error('Logo image exceeds size limit'))
      } else {
        chunks.push(chunk)
      }
    })

    response.on('end', () => {
      const buffer = Buffer.concat(chunks)
      if (contentType && !contentType.startsWith('image/')) {
        return resolve(null)
      }

      if (!isSupportedImage(buffer)) {
        if (!attemptedFallback) {
          const fallbackUrl = maybeForceCloudinaryFormat(url)
          if (fallbackUrl && fallbackUrl !== url) {
            return fetchBufferFromUrl(fallbackUrl, {
              attemptedFallback: true
            }).then(resolve).catch(reject)
          }
        }

        warnUnsupportedLogo(url)
        return resolve(null)
      }

      resolve(buffer)
    })
    response.on('error', (error) => reject(error))
  })

  request.on('error', () => resolve(null))
})

const loadLogoBuffer = async (source) => {
  if (!source) {
    return null
  }

  if (Buffer.isBuffer(source)) {
    return source
  }

  if (typeof source !== 'string') {
    return null
  }

  const trimmed = source.trim()

  if (!trimmed) {
    return null
  }

  if (trimmed.startsWith('data:image')) {
    const base64 = trimmed.substring(trimmed.indexOf('base64,') + 7)
    try {
      const buffer = Buffer.from(base64, 'base64')
      if (!isSupportedImage(buffer)) {
        warnUnsupportedLogo('data-uri')
        return null
      }
      return buffer
    } catch (_) {
      return null
    }
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return fetchBufferFromUrl(trimmed)
  }

  try {
    const resolvedPath = path.resolve(trimmed)
    const buffer = await fs.readFile(resolvedPath)
    if (!isSupportedImage(buffer)) {
      warnUnsupportedLogo(trimmed)
      return null
    }
    return buffer
  } catch (_) {
    return null
  }
}

const getStatusStyles = (status = '') => {
  const normalized = String(status).toLowerCase()

  if (['paid', 'completed', 'settled'].includes(normalized)) {
    return { fill: colors.success, text: colors.white }
  }

  if (['overdue', 'late', 'unpaid'].includes(normalized)) {
    return { fill: colors.danger, text: colors.white }
  }

  if (['pending', 'in progress', 'draft'].includes(normalized)) {
    return { fill: colors.warning, text: colors.white }
  }

  return { fill: colors.primaryDark, text: colors.white }
}

const drawStatusPill = (doc, status, rightX, y) => {
  if (!status) {
    return
  }

  const label = String(status).toUpperCase()
  const paddingX = 10
  const paddingY = 6

  doc.font('Helvetica-Bold').fontSize(9)
  const textWidth = doc.widthOfString(label)
  const pillWidth = textWidth + paddingX * 2
  const pillHeight = 18
  const x = rightX - pillWidth

  const { fill, text } = getStatusStyles(status)

  doc.save()
  doc.roundedRect(x, y, pillWidth, pillHeight, 9).fill(fill)
  doc.restore()

  doc.fillColor(text).text(label, x + paddingX, y + paddingY / 2)
}

const addSectionTitle = (doc, label) => {
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(colors.primaryDark)
    .text(label.toUpperCase())
    .moveDown(0.2)
  doc.fillColor(colors.text)
}

const drawSummaryRow = (doc, label, value, options) => {
  const { x, y, width, emphasize = false } = options
  const labelSize = emphasize ? 11 : 10
  const valueSize = emphasize ? 12 : 10

  doc
    .font(emphasize ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(labelSize)
    .fillColor(emphasize ? colors.primaryDark : colors.muted)
    .text(label, x, y, { width: width - 70 })

  doc
    .font('Helvetica-Bold')
    .fontSize(valueSize)
    .fillColor(colors.text)
    .text(value || '-', x, y, { width, align: 'right' })

  return y + (emphasize ? 22 : 18)
}

const drawTableHeader = (doc, positions, y, tableWidth) => {
  doc.save()
  doc
    .rect(positions.item, y - 10, tableWidth, 28)
    .fill(colors.lightBg)
  doc.restore()

  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(colors.muted)
  doc.text('Item', positions.item, y)
  doc.text('Qty', positions.quantity, y, { width: 50, align: 'right' })
  doc.text('Price', positions.price, y, { width: 60, align: 'right' })
  doc.text('Discount', positions.discount, y, { width: 70, align: 'right' })
  doc.text('Amount', positions.amount, y, { width: 80, align: 'right' })
  doc.moveTo(positions.item, y + 15)
    .lineTo(doc.page.width - doc.page.margins.right, y + 15)
    .strokeColor(colors.border)
    .lineWidth(1)
    .stroke()
  doc.fillColor(colors.text)
}

const drawTableRow = (doc, positions, y, item, tableWidth, index) => {
  const quantity = toNumber(item?.quantity)
  const unitPrice = toNumber(item?.unitPrice)
  const discount = toNumber(item?.discount)
  const amount = quantity * unitPrice * (1 - discount / 100)

  if (index % 2 === 0) {
    doc.save()
    doc
      .rect(positions.item, y - 6, tableWidth, 22)
      .fill(colors.lightBg)
    doc.restore()
  }

  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(colors.text)

  doc.text(item?.itemName || '', positions.item, y, {
    width: positions.quantity - positions.item - 10
  })
  doc.text(quantity ? quantity.toString() : '', positions.quantity, y, {
    width: 50,
    align: 'right'
  })
  doc.text(quantity ? formatCurrency(unitPrice) : '', positions.price, y, {
    width: 60,
    align: 'right'
  })
  doc.text(discount ? `${discount}%` : '', positions.discount, y, {
    width: 70,
    align: 'right'
  })
  doc.text(quantity ? formatCurrency(amount) : '', positions.amount, y, {
    width: 80,
    align: 'right'
  })

  doc.moveTo(positions.item, y + 16)
    .lineTo(doc.page.width - doc.page.margins.right, y + 16)
    .strokeColor(colors.border)
    .lineWidth(1)
    .stroke()
}

const ensureSpaceForTableRow = (doc, currentY) => {
  const bottomMargin = doc.page.height - doc.page.margins.bottom - 50
  if (currentY > bottomMargin) {
    doc.addPage()
    return doc.page.margins.top
  }

  return currentY
}

const resolveDate = (value) => {
  if (!value) {
    return ''
  }

  return moment(value).isValid() ? moment(value).format('ll') : value
}

export default async function generateInvoicePdf(payload = {}) {
  const {
    name = '',
    address = '',
    phone = '',
    email = '',
    dueDate,
    date,
    id = '',
    notes = '',
    subTotal = '',
    type = 'Invoice',
    vat = '',
    total = '',
    items = [],
    status = '',
    totalAmountReceived = '',
    balanceDue = '',
    company = {}
  } = payload

  const safeItems = Array.isArray(items) ? items : []
  const safeCompany = company || {}
  const companyName = safeCompany.businessName || safeCompany.name || 'Accountsy Bill'
  const documentTitle = Number(toNumber(balanceDue)) <= 0 ? 'Receipt' : (type || 'Invoice')

  const logoBuffer = await loadLogoBuffer(safeCompany.logo)

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 })
      const chunks = []

      doc.on('data', (chunk) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', (error) => reject(error))

      const pageWidth = doc.page.width
      const marginLeft = doc.page.margins.left
      const marginRight = doc.page.margins.right
      const contentWidth = pageWidth - marginLeft - marginRight

      const headerHeight = 170

      doc.save()
      doc.rect(0, 0, pageWidth, headerHeight).fill(colors.primary)
      doc.restore()

      const headerPaddingY = 36
      const companyColumnWidth = contentWidth / 2
      const invoiceColumnX = marginLeft + companyColumnWidth
      const invoiceColumnWidth = companyColumnWidth

      const logoSize = 64
      let companyTextX = marginLeft
      let companyTextWidth = companyColumnWidth

      if (logoBuffer) {
        doc.save()
        doc.rect(marginLeft, headerPaddingY - 6, logoSize + 12, logoSize + 12).fillOpacity(0.15).fill(colors.white)
        doc.restore()
        doc.image(logoBuffer, marginLeft + 6, headerPaddingY, { fit: [logoSize, logoSize], align: 'left' })
        companyTextX = marginLeft + logoSize + 20
        companyTextWidth = Math.max(companyColumnWidth - (logoSize + 20), 120)
      }

      doc
        .font('Helvetica-Bold')
        .fontSize(24)
        .fillColor(colors.white)
        .text(companyName, companyTextX, headerPaddingY, { width: companyTextWidth, align: 'left' })

      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#dbeafe')
        .text(safeCompany.email || '', companyTextX, doc.y, { width: companyTextWidth, align: 'left' })
        .text(safeCompany.phoneNumber || '', companyTextX, doc.y, { width: companyTextWidth, align: 'left' })
        .text(safeCompany.contactAddress || '', companyTextX, doc.y, { width: companyTextWidth, align: 'left' })

      doc
        .font('Helvetica-Bold')
        .fontSize(24)
        .fillColor(colors.white)
        .text(documentTitle, invoiceColumnX, headerPaddingY, { width: invoiceColumnWidth, align: 'right' })

      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#dbeafe')
        .text(`Invoice #: ${id}`, invoiceColumnX, doc.y, { width: invoiceColumnWidth, align: 'right' })
        .text(`Date: ${resolveDate(date)}`, invoiceColumnX, doc.y, { width: invoiceColumnWidth, align: 'right' })
        .text(`Due: ${resolveDate(dueDate)}`, invoiceColumnX, doc.y, { width: invoiceColumnWidth, align: 'right' })

      drawStatusPill(doc, status, marginLeft + contentWidth, headerPaddingY + 78)

      doc.y = headerHeight + 28

      const cardGutter = 20
      const cardWidth = (contentWidth - cardGutter) / 2
      const cardPadding = 16
      const cardsTop = doc.y
      const cardHeight = 150

      doc.save()
      doc.roundedRect(marginLeft, cardsTop, cardWidth, cardHeight, 12).fill(colors.lightBg)
      doc.restore()
      doc.save()
      doc.roundedRect(marginLeft, cardsTop, cardWidth, cardHeight, 12).stroke(colors.border)
      doc.restore()

      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(colors.muted)
        .text('Bill To', marginLeft + cardPadding, cardsTop + cardPadding)

      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor(colors.text)
        .text(name || '—', marginLeft + cardPadding, doc.y + 6, {
          width: cardWidth - cardPadding * 2
        })

      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(colors.muted)
        .text(email || '', marginLeft + cardPadding, doc.y + 6, {
          width: cardWidth - cardPadding * 2
        })
        .text(phone || '', {
          width: cardWidth - cardPadding * 2
        })
        .text(address || '', {
          width: cardWidth - cardPadding * 2
        })

      const summaryX = marginLeft + cardWidth + cardGutter

      doc.save()
      doc.roundedRect(summaryX, cardsTop, cardWidth, cardHeight, 12).fill(colors.lightBg)
      doc.restore()
      doc.save()
      doc.roundedRect(summaryX, cardsTop, cardWidth, cardHeight, 12).stroke(colors.border)
      doc.restore()

      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(colors.muted)
        .text('Summary', summaryX + cardPadding, cardsTop + cardPadding)

      let summaryY = cardsTop + cardPadding + 20
      summaryY = drawSummaryRow(doc, 'Sub total', formatCurrency(subTotal), {
        x: summaryX + cardPadding,
        y: summaryY,
        width: cardWidth - cardPadding * 2
      })
      summaryY = drawSummaryRow(doc, 'VAT', formatCurrency(vat), {
        x: summaryX + cardPadding,
        y: summaryY,
        width: cardWidth - cardPadding * 2
      })
      summaryY = drawSummaryRow(doc, 'Total', formatCurrency(total), {
        x: summaryX + cardPadding,
        y: summaryY,
        width: cardWidth - cardPadding * 2,
        emphasize: true
      })
      summaryY = drawSummaryRow(doc, 'Paid', formatCurrency(totalAmountReceived), {
        x: summaryX + cardPadding,
        y: summaryY + 4,
        width: cardWidth - cardPadding * 2
      })
      summaryY = drawSummaryRow(doc, 'Balance due', formatCurrency(balanceDue), {
        x: summaryX + cardPadding,
        y: summaryY,
        width: cardWidth - cardPadding * 2,
        emphasize: true
      })

      doc.y = cardsTop + cardHeight + 30

      const tableTop = doc.y
      const tableWidth = contentWidth
      const positions = {
        item: marginLeft,
        quantity: marginLeft + tableWidth * 0.58,
        price: marginLeft + tableWidth * 0.7,
        discount: marginLeft + tableWidth * 0.8,
        amount: marginLeft + tableWidth * 0.9
      }

      drawTableHeader(doc, positions, tableTop, tableWidth)

      let rowY = tableTop + 25
      safeItems.forEach((item, index) => {
        rowY = ensureSpaceForTableRow(doc, rowY)
        if (rowY === doc.page.margins.top) {
          drawTableHeader(doc, positions, rowY, tableWidth)
          rowY += 25
        }

        drawTableRow(doc, positions, rowY, item, tableWidth, index)
        rowY += 22
      })

      doc.moveDown(2)
      if (notes) {
        addSectionTitle(doc, 'Notes')
        doc
          .font('Helvetica')
          .fontSize(10)
          .fillColor(colors.text)
          .text(notes, {
            width: doc.page.width - doc.page.margins.left - doc.page.margins.right
          })
      }

      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}
