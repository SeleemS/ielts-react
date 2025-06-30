import React from 'react';
import Link from 'next/link';

const Footer = () => {
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  return (
    <footer className="bg-black text-white py-4 mt-8">
      <div className="container mx-auto flex flex-col md:flex-row items-center">
        <p className="text-sm">© {new Date().getFullYear()} IELTS-Bank | All rights reserved.</p>
        <div className="flex-1" />
        <div className="flex space-x-2 mt-4 md:mt-0 text-sm">
          <Link href="/termsofservice" className="hover:underline" onClick={scrollToTop}>Terms of Service</Link>
          <Link href="/privacypolicy" className="hover:underline" onClick={scrollToTop}>Privacy Policy</Link>
          <Link href="/contactus" className="hover:underline" onClick={scrollToTop}>Contact Us</Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
