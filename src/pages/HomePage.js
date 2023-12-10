import React from 'react';

const HomePage = () => {
    return (
        <div>
            <header>
                <h1>Welcome to My Website</h1>
                <nav>
                    {/* Navigation items here */}
                </nav>
            </header>
            
            <main>
                <section>
                    <h2>About Us</h2>
                    <p>This is a great place to introduce yourself and your site, or to include some credits.</p>
                </section>
                <section>
                    <h2>Contact</h2>
                    <p>Have questions? Reach out to us at <a href="mailto:contact@example.com">contact@example.com</a></p>
                </section>
            </main>

            <footer>
                <p>© 2023 My Website</p>
            </footer>
        </div>
    );
}

export default HomePage;
