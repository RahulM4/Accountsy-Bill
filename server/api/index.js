import { createApp } from '../app.js'
import { connectToDatabase } from '../db.js'

const app = createApp()

const ensureDatabase = async () => {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error('Missing MongoDB connection string')
  }

  await connectToDatabase(uri)
}

export default async function handler(req, res) {
  try {
    await ensureDatabase()
    return app(req, res)
  } catch (error) {
    console.error('Serverless handler error:', error?.message || error)
    res.status(500).json({ error: 'Server error' })
  }
}
