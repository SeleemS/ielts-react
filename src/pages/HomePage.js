import React, { useState } from 'react';
import {
  Box,
  Container,
  Heading,
  Text,
  Link,
  VStack,
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

    return (
        <Box>
            <Navbar />
            <Container maxW="container.md" centerContent py={6}>
                <VStack spacing={4}>
                    <Toggle onChange={handleToggleChange} />
                    <DataTable selectedOption={selectedOption} /> {/* Pass selectedOption as a prop */}
                </VStack>
            </Container>
            <Footer />
        </Box>
    );
};

export default HomePage;
