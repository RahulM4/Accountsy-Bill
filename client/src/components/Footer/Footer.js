import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import styles from './Footer.module.css'
import FabButton from '../Fab/Fab'

const Footer = () => {
    const location = useLocation()
    const [user, setUser ] = useState(JSON.parse(localStorage.getItem('profile')))

    useEffect(() => {
        setUser(JSON.parse(localStorage.getItem('profile')))
    }, [location])

    return (
        <footer>
            <div className={styles.footerText}>
            ©Rahul Mahto  | Made with ❤️ <span><a href="https://github.com/RahulM4" target="_blank" rel="noopener noreferrer">Github</a></span>
            </div>
            {user && (
            <FabButton />
            )}
        </footer>
    )
}

export default Footer
