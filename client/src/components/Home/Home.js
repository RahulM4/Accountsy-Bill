import React from 'react';
import styles from './Home.module.css';

const Home = () => {
    return (
        <div className={styles.pageContainer}>
            <section className={styles.hero}>
                <div className={styles.imgContainer}>
                    <img src="./logo.png" alt="invoicing-app" />
                </div>
                <h1>AccountsyBill</h1>
                <div className={styles.paragraph}>
                    <p>Free Invoicing App for Local Businesses</p>
                </div>
            </section>
        </div>
    );
};

export default Home;
