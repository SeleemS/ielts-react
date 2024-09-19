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
                {/* Left Ad Container with pronounced moving stripes */}
                <Flex
                    display={adDisplay}
                    width="300px"
                    height="600px"
                    bgGradient="linear(to-r, gray.400, white, gray.400)"
                    bgSize="300% 100%"
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

                {/* Data Table in the center */}
                <VStack spacing={4} flex="1" minWidth="300px">
                    <Toggle />
                    <DataTable />
                </VStack>

                {/* Right Ad Container with pronounced moving stripes */}
                <Flex
                    display={adDisplay}
                    width="300px"
                    height="600px"
                    bgGradient="linear(to-r, gray.400, white, gray.400)"
                    bgSize="300% 100%"
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


