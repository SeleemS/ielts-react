import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { 
    Box, 
    Button, 
    Flex, 
    Container, 
    VStack, 
    Text, 
    Divider, 
    Select, 
    Input,
    Badge,
    HStack,
    Heading
} from '@chakra-ui/react';
import { app } from '../firebase';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import Navbar from '../components/Navbar';
import { Helmet } from 'react-helmet';
import ShareButton from '../components/ShareButton';
import ReactGA from 'react-ga';

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

const ReadingQuestion = () => {
    let globalQuestionNumber = 0;
    const [passageText, setPassageText] = useState('');
    const [passageTitle, setPassageTitle] = useState('');
    const [questionGroups, setQuestionGroups] = useState([]);
    const [userAnswers, setUserAnswers] = useState({});
    const [answerStatuses, setAnswerStatuses] = useState({});

    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
    const shareText = "Check out this IELTS question!";

    const { isOpen, onOpen, onClose } = useDisclosure();
    const [userScore, setUserScore] = useState(null);

    const [remainingTime, setRemainingTime] = useState(1200); // 20 minutes in seconds

    useEffect(() => {
        if (remainingTime > 0) {
            const timerId = setTimeout(() => setRemainingTime(remainingTime - 1), 1000);
            return () => clearTimeout(timerId);
        }
    }, [remainingTime]);

    const formatTime = () => {
        const minutes = Math.floor(remainingTime / 60);
        const seconds = remainingTime % 60;
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    const router = useRouter();
    const { id: passageId } = router.query;

    useEffect(() => {
        globalQuestionNumber = 0;
        const fetchData = async () => {
            const db = getFirestore(app);
            const docRef = doc(db, 'readingPassages', passageId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                setPassageText(data.passageText);
                setQuestionGroups(data.questionGroups);
                setPassageTitle(data.passageTitle);
            } else {
                console.log("No such document!");
            }
        };

        fetchData();
    }, [passageId]);

    const renderQuestion = (qMap, questionNumber, group) => {
        globalQuestionNumber++;
    
        const answerStatus = answerStatuses[globalQuestionNumber];
        const isCorrect = answerStatus === 'correct';
        const isIncorrect = answerStatus === 'incorrect';
        const bgColor = isCorrect ? 'green.50' : (isIncorrect ? 'red.50' : 'white');
        const borderColor = isCorrect ? 'green.200' : (isIncorrect ? 'red.200' : 'gray.200');
    
        let answerDisplay = null;
    
        if (isIncorrect) {
            answerDisplay = (
                <Text color="red.600" mt={3} fontWeight="600" fontSize="sm">
                    Correct Answer: {qMap.answer}
                </Text>
            );
        }
    
        switch (group.questionType) {
            case "Match":
            case "True or False":
            case "Yes or No":
                return (
                    <Box key={globalQuestionNumber} mb={6}>
                        <Text mb={3} fontWeight="600" color="gray.800" fontSize="md">
                            <Text as="span" color="blue.600">{globalQuestionNumber}.</Text> {qMap.text}
                        </Text>
                        <Select 
                            onChange={e => handleAnswerChange(e, questionNumber)}
                            bg={bgColor}
                            borderColor={borderColor}
                            value={userAnswers[questionNumber] || ''}
                            isReadOnly={isCorrect || isIncorrect}
                            size="lg"
                            borderRadius="lg"
                            _hover={{ borderColor: 'blue.300' }}
                            _focus={{ borderColor: 'blue.500', boxShadow: '0 0 0 1px #3182ce' }}
                        >
                            <option value="" disabled>Select an answer</option>
                            {group.questionType === "Match" && group.options.map((option, idx) => (
                                <option key={idx} value={option}>{option}</option>
                            ))}
                            {group.questionType === "True or False" && (
                                <>
                                    <option value="true">True</option>
                                    <option value="false">False</option>
                                    <option value="not given">Not Given</option>
                                </>
                            )}
                            {group.questionType === "Yes or No" && (
                                <>
                                    <option value="yes">Yes</option>
                                    <option value="no">No</option>
                                    <option value="not given">Not Given</option>
                                </>
                            )}
                        </Select>
                        {answerDisplay}
                    </Box>
                );
            case "Short Answer":
                return (
                    <Box key={globalQuestionNumber} mb={6}>
                        <Text mb={3} fontWeight="600" color="gray.800" fontSize="md">
                            <Text as="span" color="blue.600">{globalQuestionNumber}.</Text> {qMap.text}
                        </Text>
                        <Input 
                            type="text" 
                            onChange={e => handleAnswerChange(e, questionNumber)} 
                            bg={bgColor}
                            borderColor={borderColor}
                            value={userAnswers[questionNumber] || ''}
                            isReadOnly={isCorrect || isIncorrect}
                            size="lg"
                            borderRadius="lg"
                            placeholder="Type your answer here..."
                            _hover={{ borderColor: 'blue.300' }}
                            _focus={{ borderColor: 'blue.500', boxShadow: '0 0 0 1px #3182ce' }}
                        />
                        {answerDisplay}
                    </Box>
                );
            default:
                return null;
        }
    };

    const renderQuestionGroup = (group) => {
        let localQuestionNumber = 0;
        return (
            <Box key={group.prompt} mb={8}>
                <Text fontSize="lg" fontWeight="700" mb={4} color="gray.900">
                    {group.prompt}
                </Text>
                {group.questions.map(qMap => {
                    localQuestionNumber++;
                    return renderQuestion(qMap, localQuestionNumber, group);
                })}
            </Box>
        );
    };

    const handleAnswerChange = (event, questionNumber) => {
        setUserAnswers(prevAnswers => ({
            ...prevAnswers,
            [questionNumber]: event.target.value.trim().toLowerCase()
        }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
    
        ReactGA.event({
            category: 'User Engagement',
            action: 'Submit Answer',
            label: 'Reading Test Submission'
        });
    
        let newAnswerStatuses = {};
        let correctAnswersCount = 0;
        let answerIndex = 1;
    
        const db = getFirestore(app);
        const questionDoc = doc(db, 'readingPassages', passageId);
        const docSnapshot = await getDoc(questionDoc);
    
        if (docSnapshot.exists()) {
            const data = docSnapshot.data();
            data.questionGroups.forEach(group => {
                group.questions.forEach(qMap => {
                    const correctAnswer = qMap.answer.toLowerCase();
                    const userAnswer = userAnswers[answerIndex] || "-";
    
                    if (userAnswer === correctAnswer) {
                        correctAnswersCount++;
                        newAnswerStatuses[answerIndex] = 'correct';
                    } else {
                        newAnswerStatuses[answerIndex] = 'incorrect';
                    }
                    answerIndex++;
                });
            });
    
            setAnswerStatuses(newAnswerStatuses);
            setUserScore(`You answered ${correctAnswersCount} out of ${answerIndex - 1} questions correctly!`);
            onOpen();
        } else {
            console.error("No such document!");
        }
    };

    return (
        <>
            <Helmet>
                <title>{passageTitle ? `${passageTitle} - IELTS Reading Question` : 'IELTS Reading Question'}</title>
                <meta name="description" content={`Read and answer questions for the passage: ${passageTitle}`} />
                <meta name="keywords" content="IELTS, IELTS Reading, IELTS Academic Reading, IELTS General Reading, IELTS Reading Questions, IELTS Reading Practise Questions, IELTS Practice, IELTS Test Prep, IELTS Past Papers, IELTS Questions"/>
                <meta name="robots" content="index, follow"/>
                <meta property="og:url" content="https://ielts-bank.com/"/>
            </Helmet>
            
            <Flex direction="column" minH="100vh" bg="gray.50">
                <Navbar />
                
                <Box flex="1" py={6}>
                    <Container maxW="container.xl">
                        {/* Header */}
                        <Flex justify="space-between" align="center" mb={6}>
                            <VStack align="start" spacing={1}>
                                <Heading size="lg" color="gray.900" fontWeight="700">
                                    {passageTitle}
                                </Heading>
                                <Text color="gray.600" fontSize="md">
                                    IELTS Reading Practice
                                </Text>
                            </VStack>
                            <Badge 
                                colorScheme="orange" 
                                variant="subtle" 
                                px={4} 
                                py={2} 
                                borderRadius="full"
                                fontSize="lg"
                                fontWeight="700"
                            >
                                {formatTime()}
                            </Badge>
                        </Flex>

                        {/* Main Content */}
                        <Flex 
                            direction={{ base: "column", lg: "row" }} 
                            gap={6}
                            align="stretch"
                        >
                            {/* Passage Section */}
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
                                        Reading Passage
                                    </Text>
                                </Box>
                                <Box 
                                    p={6}
                                    overflowY="auto" 
                                    maxH={{ base: "400px", lg: "600px" }}
                                    fontSize="md"
                                    lineHeight="1.7"
                                    color="gray.800"
                                >
                                    <Box dangerouslySetInnerHTML={{ __html: passageText }} />
                                </Box>
                            </Box>

                            {/* Questions Section */}
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
                                        Questions
                                    </Text>
                                </Box>
                                <Box 
                                    p={6}
                                    overflowY="auto"
                                    maxH={{ base: "400px", lg: "600px" }}
                                >
                                    {questionGroups.map((group, groupIndex) => (
                                        renderQuestionGroup(group)
                                    ))}
                                </Box>
                            </Box>
                        </Flex>

                        {/* Action Buttons */}
                        <Flex justify="center" gap={4} mt={8}>
                            <Button 
                                size="lg"
                                bg="blue.600"
                                color="white"
                                px={8}
                                py={6}
                                borderRadius="xl"
                                fontWeight="600"
                                _hover={{ 
                                    bg: 'blue.700',
                                    transform: 'translateY(-1px)',
                                    shadow: 'lg'
                                }}
                                _active={{ transform: 'translateY(0)' }}
                                transition="all 0.2s"
                                onClick={handleSubmit}
                            >
                                Submit Answers
                            </Button>
                            <ShareButton
                                title={passageTitle}
                                url={currentUrl}
                                text={`Check out this IELTS Reading Test: ${passageTitle}`}
                            />
                        </Flex>

                        {/* Results Modal */}
                        <Modal isOpen={isOpen} onClose={onClose} isCentered size="md">
                            <ModalOverlay bg="blackAlpha.600" />
                            <ModalContent mx={4} borderRadius="xl" overflow="hidden">
                                <ModalHeader bg="blue.50" color="blue.900" fontWeight="700">
                                    Your Results
                                </ModalHeader>
                                <ModalCloseButton />
                                <ModalBody py={6}>
                                    <Text fontSize="lg" color="gray.800" textAlign="center">
                                        {userScore}
                                    </Text>
                                </ModalBody>
                                <ModalFooter bg="gray.50" justifyContent="center">
                                    <Button 
                                        bg="blue.600" 
                                        color="white"
                                        borderRadius="lg"
                                        px={6}
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

export default ReadingQuestion;