import React, { useEffect, useRef } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const TermsOfService = () => {
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
          <h1 className="text-2xl font-bold">Terms of Service</h1>
          <div className="overflow-y-auto max-h-[70vh] w-full text-sm space-y-4">
            <p>Welcome to IELTSBank. Below are our Terms of Service, which outline the rules and regulations for the use of IELTSBank's Website.</p>
            <p><strong>1. Terms</strong><br />By accessing this website, you agree to be bound by these Terms of Service.</p>
            <p><strong>2. Use License</strong><br />Permission is granted to temporarily download one copy of the materials on IELTSBank's website for personal, non-commercial viewing only.</p>
            <p><strong>3. Disclaimer</strong><br />The materials on IELTSBank's website are provided "as is" without warranties.</p>
            <p><strong>4. Limitations</strong><br />In no event shall IELTSBank or its suppliers be liable for any damages arising out of the use of the materials on IELTSBank's website.</p>
            <p><strong>5. Revisions and Errata</strong><br />The materials appearing on IELTSBank's website could include errors. IELTSBank does not warrant that any of the materials are accurate or current.</p>
            <p><strong>6. Site Terms of Use Modifications</strong><br />IELTSBank may revise these Terms of Service at any time without notice.</p>
            <p><strong>Last Updated:</strong> December 11, 2023</p>
            <p>If you have any questions about these Terms of Service, please contact us.</p>
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

export default TermsOfService;
