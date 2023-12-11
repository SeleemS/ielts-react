import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Box,Button, Textarea, Flex, Container, Text, Divider } from '@chakra-ui/react';
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

    // You can add a submit handler if needed

    const handleSubmit = async (event) => {
        event.preventDefault();
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
                        maxH={{ base: "39vh", md: "75vh" }}
                        minH = {{base: "39vh", md: "75vh"}}
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
                        display="flex" // Set this box to be a flex container
                        flexDirection="column" // Stack children vertically
                        maxH={{ base: "39vh", md: "75vh" }}
                        minH={{ base: "39vh", md: "75vh" }}
                    >
                        <Text fontWeight="bold">Your Response:</Text>
                        <Divider my={4} />
                        <Textarea
                            placeholder="Type your response here..."
                            size="lg"
                            flex="1" // Allow Textarea to expand
                            minHeight="0" // Ensures flex children expand properly in some browsers
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
                {/* Add a submit button if needed */}
            </Container>
        </>
    );
};

export default WritingQuestion;
