import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { 
    Box, 
    Button, 
    Textarea, 
    Flex, 
    Container, 
    Text, 
    useToast,
    VStack,
    HStack,
    Heading,
    Progress
} from '@chakra-ui/react';
import { app } from '../firebase';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import ReactGA from 'react-ga';
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

    const router = useRouter();
    const { id: docId } = router.query;

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
    }, []);

    const handleResponseChange = (event) => {
        setUserResponse(event.target.value);
    };

    const countWords = (text) => {
        return text.split(/\s+/).filter(Boolean).length;
    };

    const wordCount = countWords(userResponse);
    const progressValue = Math.min((wordCount / 250) * 100, 100);
    const isWordCountSufficient = wordCount >= 250;

    const handleSubmit = async (event) => {
        event.preventDefault();
        
        ReactGA.event({
            category: 'User Engagement',
            action: 'Submit Writing',
            label: 'Writing Test Submission'
        });
    
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
    
        setIsLoading(true);
    
        try {
            const response = await fetch("https://wamm2ytjk5.execute-api.us-east-1.amazonaws.com/IELTSWritingBot", {
                method: "POST",
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ question: passageText, answer: userResponse })
            });
    
            if (response.ok) {
                const responseData = await response.json();
                setApiResponse(responseData.message);
                onOpen();
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
            toast({
                title: "Error",
                description: "An error occurred. Please try again.",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setIsLoading(false);
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
            
            <Flex direction="column" minH="100vh" bg="gray.50">
                <Navbar />
                
                <Box flex="1" py={6}>
                    <Container maxW="container.xl">
                        {/* Header */}
                        <VStack align="start" spacing={1} mb={6}>
                            <Heading size="lg" color="gray.900" fontWeight="700">
                                {passageTitle}
                            </Heading>
                            <Text color="gray.600" fontSize="md">
                                IELTS Writing Practice - AI-Powered Feedback
                            </Text>
                        </VStack>

                        {/* Main Content */}
                        <Flex 
                            direction={{ base: "column", lg: "row" }} 
                            gap={6}
                            align="stretch"
                        >
                            {/* Prompt Section */}
                            <Box 
                                flex="1"
                                bg="white"
                                borderRadius="xl"
                                border="1px"
                                borderColor="gray.200"
                                shadow="sm"
                                overflow="hidden"
                            >
                                <Box 
                                    p={6}
                                    borderBottom="1px"
                                    borderColor="gray.100"
                                    bg="gray.50"
                                >
                                    <Text fontSize="lg" fontWeight="700" color="gray.900">
                                        Writing Prompt
                                    </Text>
                                </Box>
                                <Box 
                                    p={6}
                                    overflowY="auto" 
                                    maxH={{ base: "300px", lg: "500px" }}
                                    fontSize="md"
                                    lineHeight="1.7"
                                    color="gray.800"
                                    fontFamily="Georgia, serif"
                                >
                                    <Box dangerouslySetInnerHTML={{ __html: passageText }} />
                                </Box>
                            </Box>

                            {/* Response Section */}
                            <Box 
                                flex="1"
                                bg="white"
                                borderRadius="xl"
                                border="1px"
                                borderColor="gray.200"
                                shadow="sm"
                                overflow="hidden"
                                display="flex"
                                flexDirection="column"
                            >
                                <Box 
                                    p={6}
                                    borderBottom="1px"
                                    borderColor="gray.100"
                                    bg="gray.50"
                                >
                                    <Flex justify="space-between" align="center">
                                        <Text fontSize="lg" fontWeight="700" color="gray.900">
                                            Your Response
                                        </Text>
                                        <VStack align="end" spacing={1}>
                                            <Text 
                                                fontSize="sm" 
                                                fontWeight="600" 
                                                color={isWordCountSufficient ? "green.600" : "orange.600"}
                                            >
                                                {wordCount} / 250 words
                                            </Text>
                                            <Progress 
                                                value={progressValue} 
                                                size="sm" 
                                                colorScheme={isWordCountSufficient ? "green" : "orange"}
                                                w="100px"
                                                borderRadius="full"
                                            />
                                        </VStack>
                                    </Flex>
                                </Box>
                                <Box p={6} flex="1" display="flex" flexDirection="column">
                                    <Textarea
                                        placeholder="Begin writing your response here... Remember to write at least 250 words for a complete answer."
                                        size="lg"
                                        flex="1"
                                        minH={{ base: "300px", lg: "400px" }}
                                        value={userResponse}
                                        onChange={handleResponseChange}
                                        border="none"
                                        _focus={{ 
                                            boxShadow: 'none',
                                            border: 'none'
                                        }}
                                        resize="none"
                                        fontSize="md"
                                        lineHeight="1.6"
                                        p={0}
                                    />
                                </Box>
                            </Box>
                        </Flex>

                        {/* Submit Button */}
                        <Flex justify="center" mt={8}>
                            <Button 
                                size="lg"
                                bg="blue.600"
                                color="white"
                                px={12}
                                py={6}
                                borderRadius="xl"
                                fontWeight="600"
                                fontSize="lg"
                                _hover={{ 
                                    bg: 'blue.700',
                                    transform: 'translateY(-2px)',
                                    shadow: 'xl'
                                }}
                                _active={{ transform: 'translateY(0)' }}
                                transition="all 0.2s"
                                onClick={handleSubmit}
                                isDisabled={!isWordCountSufficient}
                            >
                                Get AI Feedback
                            </Button>
                        </Flex>

                        {/* Information Modal */}
                        <Modal isOpen={isInfoOpen} onClose={onInfoClose} isCentered>
                            <ModalOverlay bg="blackAlpha.600" />
                            <ModalContent maxW="400px" borderRadius="xl" overflow="hidden">
                                <ModalHeader bg="blue.50" color="blue.900" fontWeight="700" textAlign="center">
                                    How This Works
                                </ModalHeader>
                                <ModalCloseButton />
                                <ModalBody textAlign="center" py={6}>
                                    <Text color="gray.700" lineHeight="1.6">
                                        We use AI to grade submissions according to the official IELTS Rubric. 
                                        Please ensure your response is a minimum of 250 words before you submit.
                                    </Text>
                                </ModalBody>
                                <ModalFooter bg="gray.50" justifyContent="center">
                                    <Button 
                                        bg="blue.600" 
                                        color="white"
                                        borderRadius="lg"
                                        px={6}
                                        _hover={{ bg: 'blue.700' }}
                                        onClick={onInfoClose}
                                    >
                                        Got it!
                                    </Button>
                                </ModalFooter>
                            </ModalContent>
                        </Modal>

                        {/* Loading Modal */}
                        <Modal isOpen={isLoading} isCentered closeOnOverlayClick={false}>
                            <ModalOverlay bg="blackAlpha.600" />
                            <ModalContent maxW="350px" borderRadius="xl" overflow="hidden">
                                <ModalBody textAlign="center" py={8}>
                                    <VStack spacing={4}>
                                        <Spinner size="xl" thickness="4px" color="blue.500" />
                                        <VStack spacing={2}>
                                            <Text fontWeight="600" color="gray.900">
                                                Analyzing your response...
                                            </Text>
                                            <Text fontSize="sm" color="gray.600">
                                                This may take up to 1 minute
                                            </Text>
                                        </VStack>
                                    </VStack>
                                </ModalBody>
                            </ModalContent>
                        </Modal>

                        {/* Results Modal */}
                        <Modal isOpen={isOpen} onClose={onClose} isCentered size="lg">
                            <ModalOverlay bg="blackAlpha.600" />
                            <ModalContent mx={4} borderRadius="xl" overflow="hidden" maxW="600px">
                                <ModalHeader bg="green.50" color="green.900" fontWeight="700">
                                    Your AI Feedback & Score
                                </ModalHeader>
                                <ModalCloseButton />
                                <ModalBody overflowY="auto" maxH="400px" py={6}>
                                    <Box 
                                        dangerouslySetInnerHTML={{ __html: apiResponse }} 
                                        sx={{
                                            '& p': { mb: 3 },
                                            '& strong': { color: 'gray.900' },
                                            '& ul': { pl: 4 },
                                            '& li': { mb: 1 }
                                        }}
                                    />
                                </ModalBody>
                                <ModalFooter bg="gray.50" justifyContent="center">
                                    <Button 
                                        bg="blue.600" 
                                        color="white"
                                        borderRadius="lg"
                                        px={8}
                                        _hover={{ bg: 'blue.700' }}
                                        onClick={onClose}
                                    >
                                        Close
                                    </Button>
                                </ModalFooter>
                            </ModalContent>
                        </Modal>
                    </Container>
                </Box>
            </Flex>
        </>
    );
};

export default WritingQuestion;