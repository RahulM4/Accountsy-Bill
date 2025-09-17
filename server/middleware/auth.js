import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'

dotenv.config()
const SECRET = process.env.SECRET || process.env.JWT_SECRET

const auth = async (req, res, next) => {
    try {
        const token = req.headers.authorization.split(" ")[1]
        const isCustomAuth = token.length < 500 

        let decodeData;

        //If token is custom token do this
        if(token && isCustomAuth) {
            if(!SECRET) {
                console.error('JWT secret missing. Set SECRET or JWT_SECRET environment variable.')
                return res.status(500).json({ message: 'Server configuration error' })
            }
            decodeData = jwt.verify(token, SECRET)

            req.userId = decodeData?.id

        } else {
            //Else of token is google token then do this
            decodeData = jwt.decode(token)

            req.userId = decodeData?.sub
        }

        next()

    } catch (error) {
        console.error('Auth middleware error:', error)
        return res.status(401).json({ message: 'Authentication failed' })
    }
}

export default auth
