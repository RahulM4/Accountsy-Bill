import jwt from "jsonwebtoken"
import nodemailer from 'nodemailer'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'

dotenv.config()
const SECRET = process.env.SECRET || process.env.JWT_SECRET

const requireJwtSecret = () => {
    if (!SECRET) {
        const error = new Error('Missing JWT secret. Set SECRET or JWT_SECRET in your environment variables.')
        error.code = 'JWT_SECRET_MISSING'
        throw error
    }
    return SECRET
}
const HOST = process.env.SMTP_HOST
const PORT = process.env.SMTP_PORT
const USER = process.env.SMTP_USER
const PASS = process.env.SMTP_PASS

import User from '../models/userModel.js'
import ProfileModel from '../models/ProfileModel.js';


export const signin = async (req, res) => {
    const { email, password } = req.body

    try {
        const existingUser = await User.findOne({ email })

        //get userprofile and append to login auth detail
        const userProfile = await ProfileModel.findOne({ userId: existingUser?._id })

        if (!existingUser) return res.status(404).json({ message: "User doesn't exist" })

        const isPasswordCorrect = await bcrypt.compare(password, existingUser.password)

        if (!isPasswordCorrect) return res.status(400).json({ message: "Invalid credentials" })

        //If crednetials are valid, create a token for the user
        const token = jwt.sign({ email: existingUser.email, id: existingUser._id }, requireJwtSecret(), { expiresIn: "1h" })

        //Then send the token to the client/frontend
        res.status(200).json({ result: existingUser, userProfile, token })

    } catch (error) {
        console.error('Signin error:', error)
        if (error?.code === 'JWT_SECRET_MISSING') {
            return res.status(500).json({ message: 'Server configuration error. Please contact support.' })
        }
        res.status(500).json({ message: "Something went wrong" })
    }
}



export const signup = async (req, res) => {
    const { email, password, confirmPassword, firstName, lastName, bio } = req.body

    try {
        const existingUser = await User.findOne({ email })
        const userProfile = await ProfileModel.findOne({ userId: existingUser?._id })

        if (existingUser) return res.status(400).json({ message: "User already exist" })

        if (password !== confirmPassword) return res.status(400).json({ message: "Password don't match" })

        const hashedPassword = await bcrypt.hash(password, 12)

        const result = await User.create({ email, password: hashedPassword, name: `${firstName} ${lastName}`, bio })

        const token = jwt.sign({ email: result.email, id: result._id }, requireJwtSecret(), { expiresIn: "1h" })

        res.status(200).json({ result, userProfile, token })

    } catch (error) {
        console.error('Signup error:', error)
        if (error?.code === 'JWT_SECRET_MISSING') {
            return res.status(500).json({ message: 'Server configuration error. Please contact support.' })
        }
        res.status(500).json({ message: "Something went wrong" })
    }
}


// export const updateProfile = async (req, res) => {
//     const formData = req.body
//     const { id: _id } = req.params
//     console.log(formData)

//     if(!mongoose.Types.ObjectId.isValid(_id)) return res.status(404).send('No user with this id found')

//     const updatedUser = await User.findByIdAndUpdate(_id, formData, {new: true})
//     res.json(updatedUser)
// }




export const forgotPassword = (req, res) => {

    const { email } = req.body

    // NODEMAILER TRANSPORT FOR SENDING POST NOTIFICATION VIA EMAIL
    const transporter = nodemailer.createTransport({
        host: HOST,
        port: PORT,
        auth: {
            user: USER,
            pass: PASS
        },
        tls: {
            rejectUnauthorized: false
        }
    })


    crypto.randomBytes(32, (err, buffer) => {
        if (err) {
            console.log(err)
        }
        const token = buffer.toString("hex")
        User.findOne({ email: email })
            .then(user => {
                if (!user) {
                    return res.status(422).json({ error: "User does not exist in our database" })
                }
                user.resetToken = token
                user.expireToken = Date.now() + 3600000
                user.save().then((result) => {
                    transporter.sendMail({
                        to: user.email,
                        from: "Accountsybill <rahulforcoding4@gmail.com>",
                        subject: "Password reset request",
                        html: `
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <meta charset="utf-8" />
                                <title>Password Reset</title>
                            </head>
                            <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; background: #f9f9f9; padding: 20px;">
                                <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; padding: 24px; box-shadow: 0 2px 6px rgba(0,0,0,0.08);">
                                <h2 style="margin-top: 0; color: #2c3e50;">Password Reset Requested</h2>
                                
                                <p>You recently requested to reset your password for your <strong>Accountsy Invoicing</strong> account.</p>
                                
                                <p style="margin: 20px 0;">
                                    <a href="https://accountsy-invoice-generator.vercel.app/reset/${token}"
                                    style="display: inline-block; background-color: #4a90e2; color: #fff; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">
                                    Reset Password
                                    </a>
                                </p>
                                
                                <p>If the button above doesn’t work, copy and paste this link into your browser:</p>
                                <p style="word-break: break-all; color: #4a90e2;">
                                    https://accountsy-invoice-generator.vercel.app/reset/${token}
                                </p>
                                
                                <p>If you didn’t request this, you can safely ignore this email. Your password won’t change until you access the link above and create a new one.</p>
                                
                                <p style="margin-top: 32px; font-size: 13px; color: #888;">
                                    &mdash; The Accountsy Invoicing Team
                                </p>
                                </div>
                            </body>
                            </html>

                    `
                    })
                    res.json({ message: "check your email" })
                }).catch((err) => console.log(err))

            })
    })
}



export const resetPassword = (req, res) => {
    const newPassword = req.body.password
    const sentToken = req.body.token
    User.findOne({ resetToken: sentToken, expireToken: { $gt: Date.now() } })
        .then(user => {
            if (!user) {
                return res.status(422).json({ error: "Try again session expired" })
            }
            bcrypt.hash(newPassword, 12).then(hashedpassword => {
                user.password = hashedpassword
                user.resetToken = undefined
                user.expireToken = undefined
                user.save().then((saveduser) => {
                    res.json({ message: "password updated success" })
                })
            })
        }).catch(err => {
            console.log(err)
        })
}
