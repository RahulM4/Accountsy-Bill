

import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import nodemailer from 'nodemailer'
import pdf from 'html-pdf'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

import invoiceRoutes from './routes/invoices.js'
import clientRoutes from './routes/clients.js'
import userRoutes from './routes/userRoutes.js'

import profile from './routes/profile.js'
import pdfTemplate from './documents/index.js'
// import invoiceTemplate from './documents/invoice.js'
import emailTemplate from './documents/email.js'

const app = express()
// Load .env and also keep parsed values so we can prefer file-defined settings in local dev
const envResult = dotenv.config()
const envFromFile = envResult?.parsed || {}

app.use((express.json({ limit: "30mb", extended: true})))
app.use((express.urlencoded({ limit: "30mb", extended: true})))
app.use((cors()))

app.use('/invoices', invoiceRoutes)
app.use('/clients', clientRoutes)
app.use('/users', userRoutes)
app.use('/profiles', profile)

// NODEMAILER TRANSPORT FOR SENDING INVOICE VIA EMAIL
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port : process.env.SMTP_PORT,
    auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
    },
    tls:{
        rejectUnauthorized:false
    }
})


var options = { format: 'A4' };
//SEND PDF INVOICE VIA EMAIL
app.post('/send-pdf', (req, res) => {
    const { email, company } = req.body

    // pdf.create(pdfTemplate(req.body), {}).toFile('invoice.pdf', (err) => {
    pdf.create(pdfTemplate(req.body), options).toFile('invoice.pdf', (err) => {
       
          // send mail with defined transport object
        transporter.sendMail({
            from: ` Accountsy Bill rahulforcoding4@gmail.com`, // sender address
            to: `${email}`, // list of receivers
            replyTo: `${company.email}`,
            subject: `Invoice from ${company.businessName ? company.businessName : company.name}`, // Subject line
            text: `Invoice from ${company.businessName ? company.businessName : company.name }`, // plain text body
            html: emailTemplate(req.body), // html body
            attachments: [{
                filename: 'invoice.pdf',
                path: `${__dirname}/invoice.pdf`
            }]
        });

        if(err) {
            res.send(Promise.reject());
        }
        res.send(Promise.resolve());
    });
});


//Problems downloading and sending invoice
// npm install html-pdf -g
// npm link html-pdf
// npm link phantomjs-prebuilt

//CREATE AND SEND PDF INVOICE
app.post('/create-pdf', (req, res) => {
    pdf.create(pdfTemplate(req.body), {}).toFile('invoice.pdf', (err) => {
        if(err) {
            res.send(Promise.reject());
        }
        res.send(Promise.resolve());
    });
});

//SEND PDF INVOICE
app.get('/fetch-pdf', (req, res) => {
     res.sendFile(`${__dirname}/invoice.pdf`)
})


app.get('/', (req, res) => {
    res.send('SERVER IS RUNNING')
  })

// Prefer .env values first (local dev), then fall back to process.env (deployment)
const PORT = process.env.PORT || 5001
const MONGODB_URI =  process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('Missing MongoDB connection string. Set `MONGODB_URI` (or `DB_URL`) in your environment/.env')
  process.exit(1)
}

// Guard against legacy multi-host mongodb:// URLs that trigger Node URL deprecation warnings
if (MONGODB_URI.startsWith('mongodb://') && MONGODB_URI.includes(',')) {
  console.warn('Detected legacy multi-host mongodb:// URL. For Atlas, switch to mongodb+srv:// format to avoid Node URL warnings.')
}

// Redact credentials for safe logging
const redactMongoUri = (uri) => {
  try {
    return uri.replace(/:\/\/.*?@/, '://<redacted>@')
  } catch (_) {
    return '<redacted>'
  }
}

console.log(`MongoDB URI source: ${envFromFile.MONGODB_URI || envFromFile.DB_URL ? '.env file' : 'process.env'}`)
console.log(`MongoDB URI preview: ${redactMongoUri(MONGODB_URI)}`)

;(async () => {
  try {
    // For mongoose v5, prefer createIndex over ensureIndex and turn off findAndModify
    mongoose.set('useCreateIndex', true)
    mongoose.set('useFindAndModify', false)

    // Keep new URL parser and unified topology enabled
    await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })

    app.listen(PORT, () => {
      console.log(`Server running on port: ${PORT} and Database connection established`)
    })
  } catch (error) {
    console.error('Database connection error:', error?.message || error)
    process.exit(1)
  }
})()
