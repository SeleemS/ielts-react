import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Flex,
  VStack,
  useBreakpointValue,
  Text,
  Container,
  Heading
} from '@chakra-ui/react';
import Navbar from '../components/Navbar'; 
import Toggle from '../components/Toggle';
import DataTable from '../components/DataTable';
import Footer from '../components/Footer';

const HomePage = () => {
    const [selectedOption, setSelectedOption] = useState('Reading');

    const handleToggleChange = (option) => {
        setSelectedOption(option);
    };

    return (
        <Flex direction="column" minH="100vh" bg="gray.50">
            <Navbar />
            
            <Box flex="1" py={8}>
                <Container maxW="container.xl">
                    <VStack spacing={8} align="center">
                        {/* Header Section */}
                        <VStack spacing={4} textAlign="center" maxW="600px">
                            <Heading 
                                size="xl" 
                                color="gray.900" 
                                fontWeight="700"
                                lineHeight="1.2"
                            >
                                Master IELTS with Real Practice Questions
                            </Heading>
                            <Text 
                                fontSize="lg" 
                                color="gray.600" 
                                fontWeight="500"
                                lineHeight="1.6"
                            >
                                Access the largest database of authentic IELTS past papers with AI-powered grading and instant feedback.
                            </Text>
                        </VStack>

                        {/* Toggle Section */}
                        <VStack spacing={6} w="full" align="center">
                            <Toggle onChange={handleToggleChange} />
                            
                            {/* Table Section */}
                            <Box w="full" maxW="900px">
                                <DataTable selectedOption={selectedOption} />
                            </Box>
                        </VStack>
                    </VStack>
                </Container>
            </Box>
            
            <Footer />
        </Flex>
    );
};

export default HomePage;