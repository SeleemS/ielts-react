import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Flex,
  VStack,
  useBreakpointValue,
  Text,
} from '@chakra-ui/react';
import Navbar from '../components/Navbar'; 
import Toggle from '../components/Toggle';
import DataTable from '../components/DataTable';
import Footer from '../components/Footer';

const HomePage = () => {
    const adContainerRef = useRef(null);
    const [isAdLoaded, setIsAdLoaded] = useState(false);

    useEffect(() => {
        if (adContainerRef.current && adContainerRef.current.offsetWidth > 0) {
        setIsAdLoaded(true);
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        }
    }, [adContainerRef.current]);

    const [selectedOption, setSelectedOption] = useState('Reading'); // State to track the selected option

    const handleToggleChange = (option) => {
        setSelectedOption(option);
    };

    const adDisplay = useBreakpointValue({ base: 'none', md: 'block' });

    return (
        <Box>
            <Navbar />
            <Flex
                direction={{ base: "column", md: "row" }}
                justify="space-between"
                align="center"
                wrap="wrap"
                px={{ md: 8 }} // Horizontal padding on medium and larger screens
                py={6}
            >
                {/* Left Ad Container */}
                <Flex display={adDisplay} width="300px" height="600px" bg="gray.200" mx={2} justifyContent="center" alignItems="center">
                    <ins className="adsbygoogle"
                        style={{ display: "block" }}
                        data-ad-client="ca-pub-5189362957619937"
                        data-ad-slot="7564021019"
                        data-ad-format="auto"
                        data-full-width-responsive="true"></ins>
                </Flex>


                <VStack spacing={4} flex="1" minWidth="300px">
                    <Toggle onChange={handleToggleChange} />
                    <DataTable selectedOption={selectedOption} />
                </VStack>

                {/* Right Ad Container */}
                <Flex display={adDisplay} width="300px" height="600px" bg="gray.200" mx={2} justifyContent="center" alignItems="center">
                    <ins className="adsbygoogle"
                        style={{ display: "block" }}
                        data-ad-client="ca-pub-5189362957619937"
                        data-ad-slot="7564021019"
                        data-ad-format="auto"
                        data-full-width-responsive="true"></ins>
                </Flex>
            </Flex>
            <Footer />
        </Box>
    );
};

export default HomePage;
