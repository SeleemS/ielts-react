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
    Select,
    Input,
} from '@chakra-ui/react';

const ListeningQuestion = () => {
    let globalQuestionNumber = 0; // Global question number
    const [audioUrl, setAudioUrl] = useState('');
    const [passageTitle, setPassageTitle] = useState('');
    const [questionGroups, setQuestionGroups] = useState([]);
    const [userAnswers, setUserAnswers] = useState({});
    const [answerStatuses, setAnswerStatuses] = useState({});
    const { isOpen, onOpen, onClose } = useDisclosure();
    const [userScore, setUserScore] = useState(null);

    const { id: passageId } = useParams();

    useEffect(() => {
        globalQuestionNumber = 0;
        const fetchData = async () => {
            const db = getFirestore(app);
            const docRef = doc(db, 'listeningPassages', passageId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                setAudioUrl(data.audioUrl);
                setPassageTitle(data.passageTitle);
                setQuestionGroups(data.questionGroups);
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
                    </Box>
                );
            default:
                return null;
        }
        globalQuestionNumber++;
    };

    const renderQuestionGroup = (group) => {
        let localQuestionNumber = 0;
        return (
            <Box key={group.prompt} mb={6}>
                <Text fontSize="lg" fontWeight="bold" mb={2}>{group.prompt}</Text>
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
        let newAnswerStatuses = {};
        let correctAnswersCount = 0;
        let answerIndex = 1; // Start from 1 to match question numbers
    
        const db = getFirestore(app);
        const questionDoc = doc(db, 'listeningPassages', passageId);
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
                {/* Helmet content similar to ReadingQuestion.js */}
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
                        minH= {{base: "33vh", md: "75vh"}}
                        mt={{ base: -1, md: 0 }}
                        mb={{ base: 3, md: 0 }}
                        mx={{ md: 2 }}
                    >
                        <Text fontSize="lg" fontWeight="bold">{passageTitle}:</Text>
                        <Divider my={4} />
                        <audio src={audioUrl} controls />
                    </Box>

                    <Box 
                        flex="1" 
                        p={5} 
                        shadow="md" 
                        borderWidth="1px" 
                        overflowY="auto" 
                        maxH={{ base: "33vh", md: "75vh" }}
                        minH= {{base: "33vh", md: "75vh"}}
                        mx={{ md: 1 }}
                    >
                        <Text fontSize="lg" fontWeight="bold">Questions:</Text>
                        <Divider my={4} />
                        {questionGroups.map((group, groupIndex) => (
                            renderQuestionGroup(group)
                        ))}
                    </Box>
                </Flex>
                <Flex justifyContent="center" mt={-2}>
                    <Button bg="black" colorScheme="blue" onClick={handleSubmit}>
                        Submit
                    </Button>
                </Flex>
                <Modal isOpen={isOpen} onClose={onClose} isCentered size="md">
                    {/* Modal content similar to ReadingQuestion.js */}
                </Modal>
            </Container>
        </>
    );
};

export default ListeningQuestion;
