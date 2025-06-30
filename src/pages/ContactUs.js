import React, { useEffect, useRef } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const ContactUs = () => {
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
          <ins
            className="adsbygoogle"
            style={{ display: 'block' }}
            data-ad-client="ca-pub-5189362957619937"
            data-ad-slot="7564021019"
            data-ad-format="auto"
            data-full-width-responsive="true"
          ></ins>
        </div>
        <div className="flex flex-col space-y-4 flex-1 min-w-[300px] px-4 items-center">
          <h1 className="text-2xl font-bold text-center">Contact Us</h1>
          <div className="max-h-[75vh] min-h-[71vh] w-full">
            <p className="text-center">
              If you have any questions or comments, we'd love to hear from you. Please feel free to reach out to us at the following email address:
              <br />
              <br />
              <a href="mailto:info@ielts-bank.com" className="text-blue-500">info@ielts-bank.com</a>
              <br />
              <br />
              We aim to respond to all inquiries as quickly as possible. Thank you for your interest in IELTSBank!
            </p>
          </div>
        </div>
        <div className="hidden md:flex w-[300px] h-[600px] bg-gray-200 mx-2 justify-center items-center">
          <ins
            className="adsbygoogle"
            style={{ display: 'block' }}
            data-ad-client="ca-pub-5189362957619937"
            data-ad-slot="7564021019"
            data-ad-format="auto"
            data-full-width-responsive="true"
          ></ins>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ContactUs;
