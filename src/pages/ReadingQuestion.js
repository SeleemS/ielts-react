import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom'; // Import useParams
import { Box, Button, Flex, Container, VStack, Text, Divider, Select, Input } from '@chakra-ui/react';
import { app } from '../firebase';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import Navbar from '../components/Navbar';

const ReadingQuestion = () => {
    const [passageText, setPassageText] = useState('');
    const [passageTitle, setPassageTitle] = useState('');
    const [questionGroups, setQuestionGroups] = useState([]);
    const [userAnswers, setUserAnswers] = useState({});
    const [answerStatuses, setAnswerStatuses] = useState({});


    // Use useParams to get the passageId from the URL
    const { id: passageId } = useParams();

    useEffect(() => {
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
        const answerStatus = answerStatuses[questionNumber];
        const isCorrect = answerStatus === 'correct';
        const isIncorrect = answerStatus === 'incorrect';
        const bgColor = isCorrect ? 'green.500' : (isIncorrect ? 'red.500' : 'gray.200');
    
        switch (group.questionType) {
            case "Match":
            case "True or False":
            case "Yes or No":
                return (
                    <Box className="mb-4" my={4}>
                        <Text><strong>{questionNumber}.</strong> {qMap.text}</Text>
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
                        <Text><strong>{questionNumber}.</strong> {qMap.text}</Text>
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
            console.log(`You answered ${correctAnswersCount} out of ${answerIndex - 1} questions correctly!`);
        } else {
            console.error("No such document!");
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
                    my={5} // Vertical margin
                >
                    <Box 
                        flex="1" 
                        p={5} 
                        shadow="md" 
                        borderWidth="1px" 
                        overflowY="auto" 
                        maxH= {{base: "39vh", md: "75vh"}}
                        mt = {{base: -2, md: 0}} // Margin top on mobile
                        mb={{ base: 3, md: 0 }} // Margin bottom on mobile
                        mx = {{md:2}}
                    >
                        <Text fontWeight="bold">{passageTitle}:</Text>
                        <Divider my={4} />
                        <Box dangerouslySetInnerHTML={{ __html: passageText }} />
                    </Box>

                    <Box 
                        flex="1" 
                        p={5} 
                        shadow="md" 
                        borderWidth="1px" 
                        overflowY="auto" 
                        maxH= {{base: "39vh", md: "75vh"}}
                        mx = {{md:1}}
                    >
                        <Text fontWeight="bold">Questions:</Text>
                        <Divider my={4} />
                        {questionGroups.map((group, groupIndex) => (
                            <Box key={groupIndex}>
                                {group.questions.map((qMap, questionIndex) => (
                                    renderQuestion(qMap, groupIndex * 10 + questionIndex + 1, group)
                                ))}
                            </Box>
                        ))}
                    </Box>
                </Flex>
                <Flex justifyContent="center" mt = {-1}>
                    <Button colorScheme="blue" onClick={handleSubmit}>
                        Submit
                    </Button>
                </Flex>
            </Container>
        </>
    );
};

export default ReadingQuestion;
