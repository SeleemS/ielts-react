import React, { useState, useEffect } from 'react';
import { Box, Container, VStack, Text, Divider } from '@chakra-ui/react';
import { app } from '../firebase'; // Adjust the import path as necessary
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const ReadingQuestion = ({ passageId }) => {
    const [passageText, setPassageText] = useState('');
    const [questionGroups, setQuestionGroups] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            const db = getFirestore(app);
            const docRef = doc(db, 'readingPassages', passageId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                setPassageText(data.passageText);
                setQuestionGroups(data.questionGroups); // Assuming questionGroups is part of your document
            } else {
                console.log("No such document!");
            }
        };

        fetchData();
    }, [passageId]);

    return (
        <Container maxW="container.xl">
            <VStack spacing={8}>
                <Box p={5} shadow="md" borderWidth="1px">
                    <Text fontWeight="bold">Passage Text:</Text>
                    <Divider my={4} />
                    <Text>{passageText}</Text>
                </Box>

                <Box p={5} shadow="md" borderWidth="1px">
                    <Text fontWeight="bold">Questions:</Text>
                    <Divider my={4} />
                    {questionGroups.map((group, index) => (
                        <Box key={index}>
                            {/* Render your questions here */}
                            <Text>{group.questionText}</Text>
                            {/* More question details */}
                        </Box>
                    ))}
                </Box>
            </VStack>
        </Container>
    );
};

export default ReadingQuestion;
