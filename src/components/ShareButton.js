import React from 'react';

const ShareButton = ({ title, url, text }) => {
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url, text });
      } catch (error) {
        console.error('Error sharing content:', error);
      }
    } else {
      console.log('Share API not supported.');
    }
  };

  return (
    <button
      onClick={handleShare}
      className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
    >
      Share
    </button>
  );
};

export default ShareButton;
