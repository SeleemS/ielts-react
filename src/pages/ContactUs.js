import React, {useEffect, useState, useRef} from 'react';
import { Box, Flex, VStack, Text, useBreakpointValue, Link, Center } from '@chakra-ui/react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const ContactUs = () => {

    const adContainerRef = useRef(null);
    const [isAdLoaded, setIsAdLoaded] = useState(false);

    useEffect(() => {
        if (adContainerRef.current && adContainerRef.current.offsetWidth > 0) {
        setIsAdLoaded(true);
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        }
    }, [adContainerRef.current]);

    const adDisplay = useBreakpointValue({ base: 'none', md: 'block' });

    return (
        <Box>
            <Navbar />
            <Flex
                direction={{ base: "column", md: "row" }}
                justify="space-between"
                align="center"
                wrap="wrap"
                px={{ md: 8 }}
                py={6}
            >
                {/* Left Ad Container */}
                <Flex display={adDisplay} width="300px" height="600px" bg="gray.200" mx={2} justifyContent="center" alignItems="center">
                    <ins className="adsbygoogle"
                        style={{ display: "block" }}
                        data-ad-client="ca-pub-5189362957619937"
                        data-ad-slot="7564021019"
                        data-ad-format="auto"
                        data-full-width-responsive="true"></ins>
                </Flex>

                {/* Contact Us Content */}
                <VStack spacing={4} flex="1" minWidth="300px" px={4} align="center">
                    <Text fontSize="2xl" fontWeight="bold" textAlign="center">Contact Us</Text>
                    <Center overflowY="auto" maxH="75vh" minH = "71vh"width="100%">
                        <Text textAlign="center">
                            If you have any questions or comments, we'd love to hear from you. Please feel free to reach out to us at the following email address:<br /><br />
                            <Link href="mailto:info@ielts-bank.com" color="blue.500">info@ielts-bank.com</Link><br /><br />
                            We aim to respond to all inquiries as quickly as possible. Thank you for your interest in IELTSBank!
                        </Text>
                    </Center>
                </VStack>

                {/* Right Ad Container */}
                <Flex display={adDisplay} width="300px" height="600px" bg="gray.200" mx={2} justifyContent="center" alignItems="center">
                    <ins className="adsbygoogle"
                        style={{ display: "block" }}
                        data-ad-client="ca-pub-5189362957619937"
                        data-ad-slot="7564021019"
                        data-ad-format="auto"
                        data-full-width-responsive="true"></ins>
                </Flex>
            </Flex>
            <Footer />
        </Box>
    );
};

export default ContactUs;
