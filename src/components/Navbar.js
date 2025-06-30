import React, { useState } from 'react';
import Link from 'next/link';

const Navbar = () => {
  const [open, setOpen] = useState(false);
  return (
    <header className="bg-black text-white p-3 flex items-center relative">
      <Link href="/" className="flex items-center">
        <img src="/image.png" alt="Logo" className="w-12 h-12" />
        <span className="ml-2 font-bold text-lg">IELTS-Bank</span>
      </Link>
      <div className="flex-1" />
      <button
        aria-label="Menu"
        onClick={() => setOpen(!open)}
        className="border border-white p-2 rounded"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-black rounded shadow-md z-10 flex flex-col text-center">
          <Link href="/" className="p-2 hover:bg-gray-800">Home</Link>
          <Link href="/termsofservice" className="p-2 hover:bg-gray-800">Privacy Policy</Link>
          <Link href="/contactus" className="p-2 hover:bg-gray-800">Contact Us</Link>
        </div>
      )}
    </header>
  );
};

export default Navbar;
