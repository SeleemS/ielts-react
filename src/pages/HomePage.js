import React, { useState } from 'react';
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
                    <Flex justifyContent="center" alignItems="center" width="100%" height="100%">
                        <Text>Ad Container</Text>
                    </Flex>
                </Flex>


                <VStack spacing={4} flex="1" minWidth="300px">
                    <Toggle onChange={handleToggleChange} />
                    <DataTable selectedOption={selectedOption} />
                </VStack>

                {/* Right Ad Container */}
                <Flex display={adDisplay} width="300px" height="600px" bg="gray.200" mx={2} justifyContent="center" alignItems="center">
                    <Flex justifyContent="center" alignItems="center" width="100%" height="100%">
                        <Text>Ad Container</Text>
                    </Flex>
                </Flex>
            </Flex>
            <Footer />
        </Box>
    );
};

export default HomePage;
