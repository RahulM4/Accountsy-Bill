import dotenv from 'dotenv'

const envResult = dotenv.config()

export const envFromFile = envResult?.parsed || {}
