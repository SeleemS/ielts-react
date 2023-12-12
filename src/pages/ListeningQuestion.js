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
    // ... other state variables

    // Use useParams to get the docId from the URL
    const { id: docId } = useParams();

    useEffect(() => {
        const fetchData = async () => {
            const db = getFirestore(app);
            const docRef = doc(db, 'listeningPassages', docId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                setAudioUrl(data.audioUrl); // Load the audio URL
                setPassageTitle(data.passageTitle);
            } else {
                console.log("No such document!");
            }
        };

        fetchData();
    }, [docId]);

    // ... other functions and handlers

    return (
        <>
            <Helmet>
                {/* Update Helmet content */}
            </Helmet>
            <Navbar />
            <Container maxW="container.xl">
                <Flex direction={{ base: "column", md: "row" }} spacing={8} align="stretch" my={5}>
                    <Box flex="1" p={5} shadow="md" borderWidth="1px" overflowY="auto" maxH={{ base: "33vh", md: "75vh" }}>
                        <Text fontSize="large" fontWeight="bold">{passageTitle}:</Text>
                        <Divider my={4} />
                        <audio src={audioUrl} controls>
                            Your browser does not support the audio element.
                        </audio>
                    </Box>
                    {/* User response box and submission button */}
                </Flex>
                {/* Modals and other components */}
            </Container>
        </>
    );
};

export default ListeningQuestion;
