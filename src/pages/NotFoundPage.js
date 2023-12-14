import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const NotFoundPage = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const timer = setTimeout(() => {
            navigate('/');
        }, 3000); // Redirects after 3 seconds

        return () => clearTimeout(timer);
    }, [navigate]);

    return (
        <div>
            <h1>404 - Page Not Found</h1>
            <p>Redirecting to the home page...</p>
        </div>
    );
};

export default NotFoundPage;
