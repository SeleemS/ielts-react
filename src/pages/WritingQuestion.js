import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Button, Textarea, Flex, Container, Text, Divider, useToast } from '@chakra-ui/react';
import { app } from '../firebase';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import Navbar from '../components/Navbar';
import { Helmet } from 'react-helmet';
import {
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalFooter,
    ModalBody,
    ModalCloseButton,
    useDisclosure,
    Spinner,
} from '@chakra-ui/react';

const WritingQuestion = () => {
    const [passageText, setPassageText] = useState('');
    const [passageTitle, setPassageTitle] = useState('');
    const [userResponse, setUserResponse] = useState('');
    const [apiResponse, setApiResponse] = useState('');
    const { isOpen, onOpen, onClose } = useDisclosure();
    const { isOpen: isInfoOpen, onOpen: onInfoOpen, onClose: onInfoClose } = useDisclosure();
    const [isLoading, setIsLoading] = useState(false);
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

    useEffect(() => {
        onInfoOpen();
        // No dependencies means this runs once when the component mounts
    }, []);
    

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

        setIsLoading(true);

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
                setIsLoading(false);
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
            setIsLoading(false); // Ensure loading is set to false in case of error
            console.error("Error:", error);
        }
    };

    return (
        <>
            <Helmet>
                <title>{passageTitle ? `${passageTitle} - IELTS Writing Task` : 'IELTS Writing Question'}</title>
                <meta name="description" content={`AI-Powered IELTS grading for your writing. Practice with a real IELTS questions like:'${passageTitle}'. Get instant feedback and improve your writing skills for a better IELTS score.`} />
                <meta name="keywords" content="IELTS Writing, IELTS Task, IELTS Writing Practice, IELTS Test Preparation, IELTS Writing Task, IELTS Writing Questions, IELTS Writing Feedback, Improve IELTS Writing"/>
                <meta name="robots" content="index, follow"/>
                <meta property="og:title" content={passageTitle ? `${passageTitle} - IELTS Writing Task` : 'IELTS Writing Question'}/>
                <meta property="og:description" content="Sharpen your IELTS writing skills with real IELTS writing tasks. Practice with immediate AI-driven feedback to enhance your writing abilities and prepare for your IELTS test."/>
                <meta property="og:url" content={`https://ielts-bank.com/writing/${docId}`}/>
                <meta property="og:image" content="https://ielts-bank.com/favicon.png"/>
            </Helmet>
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
                {/* Loading Modal */}
                {/* Information Modal */}
                <Modal isOpen={isInfoOpen} onClose={onInfoClose} isCentered>
                    <ModalOverlay />
                    <ModalContent maxW="300px">
                        <ModalHeader textAlign="center">How This Works</ModalHeader>
                        <ModalCloseButton />
                        <ModalBody textAlign="center">
                            <Text>
                                We use AI to grade submissions according to the official IELTS Rubric. 
                                Please ensure your response is a minimum of 250 words to submit.
                            </Text>
                        </ModalBody>
                        <ModalFooter justifyContent="center">
                            <Button colorScheme="blue" onClick={onInfoClose}>Got it!</Button>
                        </ModalFooter>
                    </ModalContent>
                </Modal>
                <Modal isOpen={isLoading} isCentered >
                    <ModalOverlay />
                    <ModalContent maxW = "300px">
                        <ModalBody textAlign="center" p={6}>
                            <Spinner size="xl" />
                            <Text mt={4}>Scoring your response... Could take up to 1 minute..</Text>
                        </ModalBody>
                    </ModalContent>
                </Modal>
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
