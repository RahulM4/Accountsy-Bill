import mongoose from 'mongoose'

let connectionPromise = null

export const connectToDatabase = async (uri) => {
  if (!uri) {
    throw new Error('Missing MongoDB connection string')
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection
  }

  if (!connectionPromise) {
    mongoose.set('useCreateIndex', true)
    mongoose.set('useFindAndModify', false)

    connectionPromise = mongoose
      .connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
      .catch((error) => {
        connectionPromise = null
        throw error
      })
  }

  return connectionPromise
}
