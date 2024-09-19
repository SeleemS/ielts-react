import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom'; // Import useParams
import { Box, Button, Flex, Container, VStack, Text, Divider, Select, Input } from '@chakra-ui/react';
import { app } from '../firebase';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import Navbar from '../components/Navbar';
import { Helmet } from 'react-helmet';
import ShareButton from '../components/ShareButton';

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
    
    let globalQuestionNumber = 0; // Global question number
    const [passageText, setPassageText] = useState('');
    const [passageTitle, setPassageTitle] = useState('');
    const [questionGroups, setQuestionGroups] = useState([]);
    const [userAnswers, setUserAnswers] = useState({});
    const [answerStatuses, setAnswerStatuses] = useState({});

    const currentUrl = window.location.href;
    const shareText = "Check out this IELTS question!";

    const { isOpen, onOpen, onClose } = useDisclosure();
    const [userScore, setUserScore] = useState(null); // State for user's score

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
    


    // Use useParams to get the passageId from the URL
    const { id: passageId } = useParams();

    useEffect(() => {
        globalQuestionNumber = 0;
        const fetchData = async () => {
            const db = getFirestore(app);
            const docRef = doc(db, 'readingPassages', passageId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                setPassageText(data.passageText);
                setQuestionGroups(data.questionGroups); // Assuming questionGroups is part of your document
                setPassageTitle(data.passageTitle);
            } else {
                console.log("No such document!");
            }
        };

        fetchData();
    }, [passageId]);

    const renderQuestion = (qMap, questionNumber, group) => {
        globalQuestionNumber++; // Increment the global question number
    
        const answerStatus = answerStatuses[globalQuestionNumber];
        const isCorrect = answerStatus === 'correct';
        const isIncorrect = answerStatus === 'incorrect';
        const bgColor = isCorrect ? 'green.500' : (isIncorrect ? 'red.500' : 'gray.200');
    
        let answerDisplay = null;
    
        if (isIncorrect) {
            answerDisplay = (
                <Text color="red.500" mt={2}>
                    Correct Answer: {qMap.answer}
                </Text>
            );
        }
    
        switch (group.questionType) {
            case "Match":
            case "True or False":
            case "Yes or No":
                return (
                    <Box className="mb-4" my={4}>
                        <Text><strong>{globalQuestionNumber}.</strong> {qMap.text}</Text>
                        <Select 
                            className="form-control mb-2" 
                            onChange={e => handleAnswerChange(e, questionNumber)}
                            bg={bgColor}
                            value={userAnswers[questionNumber] || ''}
                            isReadOnly={isCorrect || isIncorrect}
                        >
                            <option value="" disabled>-</option>
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
                    <Box className="mb-4">
                        <Text><strong>{globalQuestionNumber}.</strong> {qMap.text}</Text>
                        <Input 
                            type="text" 
                            className="form-control mb-2" 
                            onChange={e => handleAnswerChange(e, questionNumber)} 
                            bg={bgColor}
                            value={userAnswers[questionNumber] || ''}
                            isReadOnly={isCorrect || isIncorrect}
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
            <Box key={group.prompt} mb={6}>
                <Text fontSize="lg" fontWeight="bold" mb={2}>{group.prompt}</Text>
                {group.questions.map(qMap => {
                    localQuestionNumber++; // Increment local counter
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
        let newAnswerStatuses = {};
        let correctAnswersCount = 0;
        let answerIndex = 1; // Start from 1 to match question numbers
    
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
            setUserScore(`You answered ${correctAnswersCount} out of ${answerIndex - 1} questions correctly!`); // Update the score here
            onOpen(); // Then open the modal
            console.log(`You answered ${correctAnswersCount} out of ${answerIndex - 1} questions correctly!`);
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
            <Navbar />
            <Container maxW="container.xl">
                <Flex 
                    direction={{ base: "column", md: "row" }} 
                    spacing={8} 
                    align="stretch" 
                    my={5} // Vertical margin
                >
                    <Box 
                        flex="1" 
                        p={5} 
                        shadow="md" 
                        borderWidth="1px" 
                        overflowY="auto" 
                        maxH= {{base: "33vh", md: "75vh"}}
                        mt = {{base: -1, md: 0}} // Margin top on mobile
                        mb={{ base: 3, md: 0 }} // Margin bottom on mobile
                        mx = {{md:2}}
                    >
                        <Text fontSize = "lg" fontWeight="bold">{passageTitle}:</Text>
                        <Divider my={4} />
                        <Box dangerouslySetInnerHTML={{ __html: passageText }} />
                    </Box>

                    <Box 
                        flex="1" 
                        p={5} 
                        shadow="md" 
                        borderWidth="1px" 
                        overflowY="auto" 
                        maxH={{base: "33vh", md: "75vh"}}
                        mx={{md:1}}
                    >
                        <Flex justifyContent="space-between" alignItems="center">
                            <Text fontSize="lg" fontWeight="bold">Questions:</Text>
                            <Text fontSize="4xl" fontWeight="bold" color="red.500">{formatTime()}</Text>
                        </Flex>
                        <Divider my={4} />
                        {questionGroups.map((group, groupIndex) => (
                            <Box key={groupIndex} mb={6}>
                                <Text fontSize="md" fontWeight="bold" mb={2}>{group.prompt}</Text>
                                {group.questions.map((qMap, questionIndex) => {
                                    return renderQuestion(qMap, questionIndex + 1, group);
                                })}
                            </Box>
                        ))}
                    </Box>
                </Flex>
                <Flex justifyContent="center" mt={-2}>
                    <Button bg="black" colorScheme="blue" mr = {3} onClick={handleSubmit}>
                        Submit
                    </Button>
                    <ShareButton 
                        title={passageTitle} 
                        url={window.location.href} 
                        text={`Check out this IELTS Listening Test: ${passageTitle}`} 
                    />
                </Flex>
                <Modal isOpen={isOpen} onClose={onClose} isCentered size="md">
                    <ModalOverlay />
                    <ModalContent mx={4} my="auto" maxW="sm" w="auto"> {/* Adjust width and margins */}
                        <ModalHeader>Your Score</ModalHeader>
                        <ModalCloseButton />
                        <ModalBody>
                            <Text>{userScore}</Text>
                        </ModalBody>
                        <ModalFooter>
                            <Button bg="black" colorScheme="blue" mr={3} onClick={onClose}>
                                Close
                            </Button>
                        </ModalFooter>
                    </ModalContent>
                </Modal>
            </Container>
        </>
    );
};

export default ReadingQuestion;
