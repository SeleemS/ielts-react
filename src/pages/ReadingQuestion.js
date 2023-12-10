import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom'; // Import useParams
import { Box, Flex, Container, VStack, Text, Divider } from '@chakra-ui/react';
import { app } from '../firebase';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import Navbar from '../components/Navbar';

const ReadingQuestion = () => {
    const [passageText, setPassageText] = useState('');
    const [passageTitle, setPassageTitle] = useState('');
    const [questionGroups, setQuestionGroups] = useState([]);

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
                        maxH= {{base: "40vh", md: "75vh"}}
                        mb={{ base: 4, md: 0 }} // Margin bottom on mobile
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
                        maxH="50vh" // Adjusted height
                        mx = {{md:2}}
                    >
                        <Text fontWeight="bold">Questions:</Text>
                        <Divider my={4} />
                        {questionGroups.map((group, index) => (
                            <Box key={index}>
                                <Text>{group.questionText}</Text>
                                {/* More question details */}
                            </Box>
                        ))}
                    </Box>
                </Flex>
            </Container>
        </>
    );
};

export default ReadingQuestion;
