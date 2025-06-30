import React, { useEffect, useRef } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const PrivacyPolicy = () => {
  const adContainerRef = useRef(null);
  useEffect(() => {
    if (adContainerRef.current && adContainerRef.current.offsetWidth > 0) {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    }
  }, [adContainerRef.current]);

  return (
    <div>
      <Navbar />
      <div className="flex flex-col md:flex-row justify-between items-center flex-wrap px-0 md:px-8 py-6">
        <div className="hidden md:flex w-[300px] h-[600px] bg-gray-200 mx-2 justify-center items-center">
          <ins className="adsbygoogle" style={{ display: 'block' }} data-ad-client="ca-pub-5189362957619937" data-ad-slot="7564021019" data-ad-format="auto" data-full-width-responsive="true"></ins>
        </div>
        <div className="flex flex-col space-y-4 flex-1 min-w-[300px] px-4">
          <h1 className="text-2xl font-bold">Privacy Policy</h1>
          <div className="overflow-y-auto max-h-[70vh] w-full text-sm space-y-4">
            <p>Welcome to IELTSBank. This privacy policy outlines our policies regarding the collection, use, and disclosure of information we receive from users of our site.</p>
            <p><strong>Information Collection and Use</strong><br />IELTSBank does not collect any personally identifiable information from its users.</p>
            <p><strong>Log Data</strong><br />We do not collect information that your browser sends when you visit our Site.</p>
            <p><strong>Cookies and Tracking</strong><br />IELTSBank does not use cookies or any form of tracking.</p>
            <p><strong>Data Security</strong><br />Since we do not collect personal data, there is no risk of such data being exposed or misused.</p>
            <p><strong>Changes to This Privacy Policy</strong><br />This Privacy Policy is effective as of the last updated date and will remain in effect except with respect to any changes in its provisions in the future.</p>
            <p><strong>Last Updated:</strong> December 11, 2023</p>
            <p>If you have any questions about this Privacy Policy, please contact us.</p>
          </div>
        </div>
        <div className="hidden md:flex w-[300px] h-[600px] bg-gray-200 mx-2 justify-center items-center">
          <ins className="adsbygoogle" style={{ display: 'block' }} data-ad-client="ca-pub-5189362957619937" data-ad-slot="7564021019" data-ad-format="auto" data-full-width-responsive="true"></ins>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
