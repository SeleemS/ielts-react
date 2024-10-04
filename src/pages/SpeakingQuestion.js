import React from 'react';
import { Box, Text, Button, VStack, Container, Flex } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const SpeakingQuestion = () => {
    const navigate = useNavigate();

    const handleStartTest = () => {
        // Navigate to the actual test page or start the test logic
        navigate('/ielts-react/speakingtest'); // Update this route as needed
    };

    return (
        <Flex direction="column" minH="100vh">
            <Navbar />
            <Container maxW="container.md" py={10} flex="1">
                <VStack spacing={5} align="stretch">
                    <Text fontSize="2xl" fontWeight="bold">
                        IELTS Speaking Mock Test
                    </Text>
                    <Text fontSize="md">
                        Welcome to the IELTS Speaking Mock Test. This test will simulate the real IELTS speaking test, allowing you to practice and prepare effectively.
                    </Text>
                    <Text fontSize="md">
                        The test will last approximately 10 minutes and consists of three parts:
                    </Text>
                    <Box pl={5}>
                        <Text>1. Introduction and Interview</Text>
                        <Text>2. Long Turn (Cue Card)</Text>
                        <Text>3. Discussion</Text>
                    </Box>
                    <Text fontSize="md">
                        Please ensure you have a microphone enabled. Click the "Start Test" button when you're ready to begin.
                    </Text>
                    <Button
                        bg="black"
                        color="white"
                        size="lg"
                        _hover={{ bg: "gray.800" }} // Optional hover effect
                        onClick={handleStartTest}
                        alignSelf="center"
                    >
                        Start Test
                    </Button>
                </VStack>
            </Container>
            <Footer />
        </Flex>
    );
};

export default SpeakingQuestion;
