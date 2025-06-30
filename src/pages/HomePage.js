import React, { useState, useEffect, useRef } from 'react';
import Navbar from '../components/Navbar';
import Toggle from '../components/Toggle';
import DataTable from '../components/DataTable';
import Footer from '../components/Footer';

const HomePage = () => {
  const adContainerRef = useRef(null);
  const [selectedOption, setSelectedOption] = useState('Reading');
  const handleToggleChange = option => setSelectedOption(option);

  useEffect(() => {
    if (adContainerRef.current && adContainerRef.current.offsetWidth > 0) {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    }
  }, [adContainerRef.current]);

  return (
    <div>
      <Navbar />
      <div className="flex flex-col md:flex-row justify-between items-center flex-wrap px-0 md:px-8 py-6">
        <div
          className="hidden md:flex w-[300px] h-[600px] bg-gradient-to-r from-gray-300 via-white to-gray-300 bg-[length:200%_100%] animate-[moveStripes_3s_linear_infinite] mx-2 justify-center items-center"
        >
          <ins
            className="adsbygoogle"
            style={{ display: 'block' }}
            data-ad-client="ca-pub-5189362957619937"
            data-ad-slot="7564021019"
            data-ad-format="auto"
            data-full-width-responsive="true"
          ></ins>
        </div>
        <div className="flex flex-col space-y-4 flex-1 min-w-[300px] min-h-[600px] items-center">
          <Toggle onChange={handleToggleChange} />
          <DataTable selectedOption={selectedOption} />
        </div>
        <div
          className="hidden md:flex w-[300px] h-[600px] bg-gradient-to-r from-gray-300 via-white to-gray-300 bg-[length:200%_100%] animate-[moveStripes_3s_linear_infinite] mx-2 justify-center items-center"
        >
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

export default HomePage;
