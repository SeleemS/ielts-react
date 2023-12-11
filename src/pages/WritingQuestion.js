import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Button, Textarea, Flex, Container, Text, Divider, useToast } from '@chakra-ui/react';
import { app } from '../firebase';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import Navbar from '../components/Navbar';
import {
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalFooter,
    ModalBody,
    ModalCloseButton,
    useDisclosure,
} from '@chakra-ui/react';

const WritingQuestion = () => {
    const [passageText, setPassageText] = useState('');
    const [passageTitle, setPassageTitle] = useState('');
    const [userResponse, setUserResponse] = useState('');
    const [apiResponse, setApiResponse] = useState('');
    const { isOpen, onOpen, onClose } = useDisclosure();
    const toast = useToast();

    // Use useParams to get the docId from the URL
    const { id: docId } = useParams();

    useEffect(() => {
        const fetchData = async () => {
            const db = getFirestore(app);
            const docRef = doc(db, 'writingPassages', docId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                setPassageText(data.passageText);
                setPassageTitle(data.passageTitle);
            } else {
                console.log("No such document!");
            }
        };

        fetchData();
    }, [docId]);

    const handleResponseChange = (event) => {
        setUserResponse(event.target.value);
    };

    // Word Counter
    const countWords = (text) => {
        return text.split(/\s+/).filter(Boolean).length; // Split by spaces and filter out empty strings
    };

    // You can add a submit handler if needed

    const handleSubmit = async (event) => {
        event.preventDefault();
        const wordCount = countWords(userResponse);
        
        if (wordCount < 250) {
            toast({
                title: "Word Count Too Low",
                description: `Your answer must be at least 250 words long. Your current word count is: ${wordCount}`,
                status: "error",
                duration: 5000,
                isClosable: true,
            });
            return;
        }

        const apiUrl = "https://wamm2ytjk5.execute-api.us-east-1.amazonaws.com/IELTSWritingBot";

        try {
            const response = await fetch(apiUrl, {
                method: "POST",
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ question: passageText, answer: userResponse })
            });

            if (response.ok) {
                const responseData = await response.json(); // Assuming the response is JSON formatted
                setApiResponse(responseData.message);
                onOpen(); // Open the modal with the response
            } else {
                toast({
                    title: "Error",
                    description: "Failed to score the answer. Please try again.",
                    status: "error",
                    duration: 5000,
                    isClosable: true,
                });
            }
        } catch (error) {
            console.error("Error:", error);
        }
    };

    return (
        <>
            <Navbar />
            <Container maxW="container.xl">
                <Flex 
                    direction={{ base: "column", md: "row" }} 
                    spacing={8} 
                    align="stretch" 
                    my={5}
                >
                    <Box 
                        flex="1" 
                        p={5} 
                        shadow="md" 
                        borderWidth="1px" 
                        overflowY="auto" 
                        maxH={{ base: "33vh", md: "75vh" }}
                        minH = {{base: "33vh", md: "75vh"}}
                        mt = {{base: -2, md: 0}} // Margin top on mobile
                        mb={{ base: 3, md: 0 }} // Margin bottom on mobile
                        mx = {{md:2}}
                    >
                        <Text fontSize = "large" fontWeight="bold">{passageTitle}:</Text>
                        <Divider my={4} />
                        <Box dangerouslySetInnerHTML={{ __html: passageText }} />
                    </Box>

                    <Box 
                        flex="1" 
                        p={5} 
                        shadow="md" 
                        borderWidth="1px" 
                        overflowY="auto" 
                        display="flex" 
                        flexDirection="column" 
                        maxH={{ base: "33vh", md: "75vh" }}
                        minH={{ base: "33vh", md: "75vh" }}
                    >
                        <Flex alignItems="center">
                            <Text fontSize = "lg" fontWeight="bold" mr={2}>Your Response:</Text>
                            <Text fontSize="sm" fontWeight="bold" color="gray.600">({countWords(userResponse)} words / 250)</Text>
                        </Flex>
                        <Divider my={4} />
                        <Textarea
                            placeholder="Type your response here..."
                            size="lg"
                            flex="1" 
                            minHeight="0" 
                            value={userResponse}
                            onChange={handleResponseChange}
                        />
                    </Box>
                </Flex>
                <Flex justifyContent="center" mt = {-1}>
                    <Button colorScheme="blue" onClick={handleSubmit}>
                        Submit
                    </Button>
                </Flex>
                <Modal isOpen={isOpen} onClose={onClose} isCentered size="xs">
                    <ModalOverlay />
                    <ModalContent mx={4} my="auto" maxW="400px">
                        <ModalHeader fontWeight="bold">Your Score</ModalHeader>
                        <ModalCloseButton />
                        <ModalBody overflowY="auto" maxH="250px">
                            <Text>{apiResponse}</Text>
                        </ModalBody>
                        <ModalFooter justifyContent={'center'}>
                            <Button colorScheme="blue" mr={3} onClick={onClose}>
                                Close
                            </Button>
                        </ModalFooter>
                    </ModalContent>
                </Modal>
            </Container>
        </>
    );
};

export default WritingQuestion;
