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
import { keyframes} from '@chakra-ui/react';

const moveStripes = keyframes`
  0% { background-position: 0% 50%; }
  100% { background-position: 100% 50%; }
`;


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
                px={{ md: 8 }}
                py={6}
            >
                {/* Left Ad Container with animated stripes */}
                <Flex
                    display={adDisplay}
                    width="300px"
                    height="600px"
                    bg="gray.200"
                    bgGradient="linear(to-r, gray.300, white, gray.300)"
                    bgSize="200% 100%"
                    animation={`${moveStripes} 3s linear infinite`}
                    mx={2}
                    justifyContent="center"
                    alignItems="center"
                >
                    <ins className="adsbygoogle"
                        style={{ display: "block" }}
                        data-ad-client="ca-pub-5189362957619937"
                        data-ad-slot="7564021019"
                        data-ad-format="auto"
                        data-full-width-responsive="true"></ins>
                </Flex>

                {/* DataTable remains unchanged to ensure full functionality */}
                <VStack spacing={4} flex="1" minWidth="300px">
                    <Toggle onChange={handleToggleChange} />
                    <DataTable selectedOption={selectedOption} />
                </VStack>

                {/* Right Ad Container with animated stripes */}
                <Flex
                    display={adDisplay}
                    width="300px"
                    height="600px"
                    bg="gray.200"
                    bgGradient="linear(to-r, gray.300, white, gray.300)"
                    bgSize="200% 100%"
                    animation={`${moveStripes} 3s linear infinite`}
                    mx={2}
                    justifyContent="center"
                    alignItems="center"
                >
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
