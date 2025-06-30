import React, { useEffect } from 'react';
import { useRouter } from 'next/router';

const NotFoundPage = () => {
    const router = useRouter();

    useEffect(() => {
        const timer = setTimeout(() => {
            router.push('/');
        }, 3000); // Redirects after 3 seconds

        return () => clearTimeout(timer);
    }, [router]);

    return (
        <div>
            <h1>404 - Page Not Found</h1>
            <p>Redirecting to the home page...</p>
        </div>
    );
};

export default NotFoundPage;
