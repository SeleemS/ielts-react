import React from 'react';
import { Button } from '@chakra-ui/react';

const ShareButton = ({ title, url, text }) => {
    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: title,
                    url: url,
                    text: text
                });
                console.log('Content shared successfully');
            } catch (error) {
                console.error('Error sharing content:', error);
            }
        } else {
            console.log('Share API not supported.');
        }
    };

    return (
        <Button  colorScheme="green" onClick={handleShare}>
            Share
        </Button>
    );
};

export default ShareButton;
