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

const ListeningQuestion = () => {
    const [audioUrl, setAudioUrl] = useState('');
    const [passageTitle, setPassageTitle] = useState('');
    const [userResponse, setUserResponse] = useState('');
    // ... other state variables and hooks

    const { id: docId } = useParams();

    useEffect(() => {
        const fetchData = async () => {
            const db = getFirestore(app);
            const docRef = doc(db, 'listeningPassages', docId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                setAudioUrl(data.audioUrl);
                setPassageTitle(data.passageTitle);
            } else {
                console.log("No such document!");
            }
        };

        fetchData();
    }, [docId]);

    // ... other functions and handlers

    const handleResponseChange = (event) => {
        setUserResponse(event.target.value);
    };

    // ... other necessary functions

    return (
        <>
            <Helmet>
                {/* Add Helmet content similar to WritingQuestion */}
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
                        minH={{ base: "33vh", md: "75vh" }}
                        mt={{ base: -2, md: 0 }}
                        mb={{ base: 3, md: 0 }}
                        mx={{ md: 2 }}
                    >
                        <Text fontSize="large" fontWeight="bold" mb={3}>{passageTitle}:</Text>
                        <Flex 
                            direction="column" 
                            alignItems="center" 
                            justifyContent="center"
                            h="100%" // Full height of the container
                        >
                            <audio src={audioUrl} controls style={{ width: '100%', maxWidth: '400px' }}>
                                Your browser does not support the audio element.
                            </audio>
                        </Flex>
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
                            <Text fontSize="lg" fontWeight="bold" mr={2}>Your Response:</Text>
                            {/* Add word count and other UI elements if needed */}
                        </Flex>
                        <Divider my={4} />
                        <Textarea
                            placeholder="Coming Soon.."
                            size="lg"
                            flex="1" 
                            minHeight="0" 
                            value={userResponse}
                          
                        />
                    </Box>
                </Flex>
                <Flex justifyContent="center" mt={-1}>
                    <Button bg="black" colorScheme="blue" >
                        Submit
                    </Button>
                </Flex>
                {/* Add Modals for loading, information, and results similar to WritingQuestion */}
            </Container>
        </>
    );
};

export default ListeningQuestion;
