import React from 'react';
import {
  Box,
  Container,
  Heading,
  Text,
  Link,
  VStack,
} from '@chakra-ui/react';
import Navbar from '../components/Navbar.js'; // Make sure the path is correct

const HomePage = () => {
    return (
        <Box>
            {/* Include Navbar */}
            <Navbar />

            {/* Main Content */}
            <Container maxW="container.md" centerContent py={6}>
                {/* Your content */}
            </Container>

            {/* Footer */}
            {/* Your footer */}
        </Box>
    );
}

export default HomePage;
