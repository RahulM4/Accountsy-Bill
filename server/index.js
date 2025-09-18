import { createApp } from './app.js'
import { connectToDatabase } from './db.js'
import { envFromFile } from './env.js'

const app = createApp()

const PORT = process.env.PORT || 5001
const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('Missing MongoDB connection string. Set `MONGODB_URI` (or `DB_URL`) in your environment/.env')
  process.exit(1)
}

if (MONGODB_URI.startsWith('mongodb://') && MONGODB_URI.includes(',')) {
  console.warn('Detected legacy multi-host mongodb:// URL. For Atlas, switch to mongodb+srv:// format to avoid Node URL warnings.')
}

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
    await connectToDatabase(MONGODB_URI)

    app.listen(PORT, () => {
      console.log(`Server running on port: ${PORT} and Database connection established`)
    })
  } catch (error) {
    console.error('Database connection error:', error?.message || error)
    process.exit(1)
  }
})()
