import express from 'express'
import cors from 'cors'
import nodemailer from 'nodemailer'

import invoiceRoutes from './routes/invoices.js'
import clientRoutes from './routes/clients.js'
import userRoutes from './routes/userRoutes.js'
import profile from './routes/profile.js'
import generateInvoicePdf from './documents/index.js'
import emailTemplate from './documents/email.js'
import { envFromFile } from './env.js'

const normalizeOrigin = (origin = '') => origin.replace(/\/$/, '')
const defaultAllowedOrigins = [
  'http://localhost:3000',
  'https://accountsybill.com',
  'https://www.accountsybill.com',
  'https://accountsy-invoice-generator.vercel.app'
]

const extraOriginsFromEnv = (envFromFile.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((value) => normalizeOrigin(value.trim()))
  .filter(Boolean)

const allowedOrigins = Array.from(new Set([
  ...defaultAllowedOrigins.map(normalizeOrigin),
  ...extraOriginsFromEnv
]))

export const createApp = () => {
  const app = express()

  app.use(express.json({ limit: '30mb', extended: true }))
  app.use(express.urlencoded({ limit: '30mb', extended: true }))
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true)
      }

      const normalized = normalizeOrigin(origin)
      if (allowedOrigins.includes(normalized)) {
        return callback(null, true)
      }

      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true)
      }

      console.warn(`Blocked CORS origin: ${origin}`)
      return callback(new Error('Not allowed by CORS'))
    },
    credentials: true
  }))

  app.use('/invoices', invoiceRoutes)
  app.use('/clients', clientRoutes)
  app.use('/users', userRoutes)
  app.use('/profiles', profile)

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  })

  let latestInvoicePdf = null

  const buildInvoicePdf = async (payload = {}) => {
    const buffer = await generateInvoicePdf(payload)
    latestInvoicePdf = buffer
    return buffer
  }

  app.post('/send-pdf', async (req, res) => {
    const { email, company = {} } = req.body || {}

    if (!email) {
      return res.status(400).json({ error: 'Recipient email is required' })
    }

    try {
      const pdfBuffer = await buildInvoicePdf(req.body)

      await transporter.sendMail({
        from: `Accountsy Bill <${process.env.SMTP_USER || 'no-reply@accountsybill.com'}>`,
        to: email,
        replyTo: company?.email,
        subject: `Invoice from ${company?.businessName || company?.name || 'Accountsy Bill'}`,
        text: `Invoice from ${company?.businessName || company?.name || 'Accountsy Bill'}`,
        html: emailTemplate(req.body),
        attachments: [
          {
            filename: 'invoice.pdf',
            content: pdfBuffer
          }
        ]
      })

      res.status(200).json({ success: true })
    } catch (error) {
      console.error('Failed to send invoice email:', error)
      res.status(500).json({ error: 'Failed to send invoice email' })
    }
  })

  app.post('/create-pdf', async (req, res) => {
    try {
      await buildInvoicePdf(req.body)
      res.status(200).json({ success: true })
    } catch (error) {
      console.error('Failed to create invoice PDF:', error)
      res.status(500).json({ error: 'Failed to create invoice PDF' })
    }
  })

  app.get('/fetch-pdf', (req, res) => {
    if (!latestInvoicePdf) {
      return res.status(404).json({ error: 'No invoice PDF available. Create one first.' })
    }

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename=invoice.pdf')
    res.send(latestInvoicePdf)
  })

  app.get('/', (req, res) => {
    res.send('SERVER IS RUNNING')
  })

  return app
}
