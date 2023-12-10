import React from 'react';
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

const HomePage = () => {
    const handleToggleChange = (value) => {
        console.log("Selected:", value);
        // Additional logic to handle the change
    };

    return (
        <Box>
            {/* Include Navbar */}
            <Navbar />

            {/* Main Content */}
            <Container maxW="100%" centerContent py={6}>
                <VStack spacing={4}>
                    {/* Place the Toggle component here */}
                    <Toggle onChange={handleToggleChange} />
                    <DataTable />
                    

                    {/* Rest of your content */}
                    {/* Example content */}
                    <Heading>IELTSBank</Heading>
                    <Text> </Text>
                </VStack>
            </Container>

            {/* Footer */}
            {/* Your footer */}
        </Box>
    );
}

export default HomePage;
