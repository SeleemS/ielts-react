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
        <Button  
            size="lg"
            variant="outline"
            borderColor="blue.600"
            color="blue.600"
            px={8}
            py={6}
            borderRadius="xl"
            fontWeight="600"
            _hover={{ 
                bg: 'blue.50',
                transform: 'translateY(-1px)',
                shadow: 'lg'
            }}
            _active={{ transform: 'translateY(0)' }}
            transition="all 0.2s"
            onClick={handleShare}
        >
            Share
        </Button>
    );
};

export default ShareButton;